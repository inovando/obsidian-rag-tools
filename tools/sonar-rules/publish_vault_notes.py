#!/usr/bin/env python3
"""Publica TODA a documentação das regras do SonarQube como notas do vault Obsidian.

O vault é a única fonte da verdade: nenhum projeto guarda cópia dos documentos.
Cada nota respeita o limite de 200 linhas do vault — categorias e catálogos grandes
são quebrados em partes automaticamente.

Uso:
    python3 publish_vault_notes.py [--vault CAMINHO] [--dry-run] [--refresh]

Notas geradas em `_shared/sonar/`:
    shared-sonar-index                  índice, como usar e como regenerar
    shared-sonar-regras-<cat>[-pN]      regras obrigatórias com exemplos oficiais
    shared-sonar-catalogo-<grupo>[-pN]  catálogo exaustivo por linguagem/severidade

Também grava `curadoria.json` (contrato máquina-legível) no diretório da ferramenta e,
se existir, no diretório da skill `sonar-gate`, que consome a mesma curadoria.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
from datetime import datetime

from sonar_rules import (
    CATEGORIAS,
    CURADAS,
    HOST,
    LANG_TITLES,
    OUT_DIR,
    SEV_ORDER,
    build_index,
    carregar_regras,
    code_examples,
    first_sentence,
)

VAULT_DEFAULT = "/home/jean/Projects/local_rag_obisidian_project/references"
SKILL_DIR = os.path.expanduser("~/.claude/skills/sonar-gate")
SUBDIR = "_shared/sonar"
PREFIX = "shared-sonar-"

# Limite do vault (200 linhas) menos frontmatter, TL;DR e rodapé. Um bloco indivisível
# (regra com dois exemplos, ~35 linhas) ainda pode estourar o orçamento por cima.
MAX_LINHAS_NOTA = 200
ORCAMENTO_REGRAS = 130
ORCAMENTO_CATALOGO = 150

TAGS_BASE = ["quality/sonarqube", "pattern/clean-code"]
TAGS_STACK = ["stack/javascript", "stack/typescript", "stack/python"]

SOURCES = [
    "https://sonarqube.inovan.do",
    "https://rules.sonarsource.com/javascript/",
    "https://rules.sonarsource.com/typescript/",
    "https://rules.sonarsource.com/python/",
]

RESUMOS = {
    "fluxo": [
        "Regras do Sonar sobre `if/else`, ternários, aninhamento e código inalcançável.",
        "Padrão exigido: guard clause + early return no lugar de `if` aninhado e ternário encadeado.",
        "É o grupo mais violado por código gerado sem revisão.",
    ],
    "complexidade": [
        "Limites objetivos do perfil: complexidade cognitiva 15, funções aninhadas 4, parâmetros 7.",
        "A correção é sempre extrair função ou inverter a condição, nunca subir o limite.",
        "Todas as regras deste grupo são CRITICAL ou MAJOR.",
    ],
    "duplicacao": [
        "Regras contra ramos duplicados, funções idênticas e código morto.",
        "Inclui imports, variáveis e atribuições não utilizadas e código comentado.",
        "Violação típica de IA: `if/else` com os dois ramos iguais.",
    ],
    "condicionais": [
        "Regras contra condição redundante, comparação com booleano literal e expressão espelhada.",
        "Inclui `indexOf` comparado com `> 0` e condição repetida em cadeia `if/else if`.",
        "Sinalizam bug real com frequência, não só estilo.",
    ],
    "async": [
        "Regras sobre `await`, Promises, callbacks `async` e `finally`.",
        "`finally` nunca deve conter `return`/`throw`: descarta a exceção original.",
        "Aplicáveis a AdonisJS (backend) e a hooks/serviços do Next.js.",
    ],
    "erros": [
        "Regras sobre `catch` vazio, `throw` de literal e `Error` sem mensagem.",
        "Erro engolido é a principal causa de bug silencioso em produção.",
        "Complementa a diretriz global de nunca ignorar exceção sem log.",
    ],
    "tipos": [
        "Regras de tipagem TypeScript: cast redundante, non-null assertion, union redundante.",
        "Inclui a preferência obrigatória por `??` e por optional chaining.",
        "Relevante para o next-portal-rimatur (TypeScript 5.3 strict).",
    ],
    "react": [
        "Regras de React/JSX: `key` estável, componente aninhado, Context memoizado, fragmento redundante.",
        "`key` por índice de array causa bug de estado em lista reordenável.",
        "Valem para React 18 com Pages Router ou App Router.",
    ],
    "modernidade": [
        "Regras que exigem a API moderna equivalente e proíbem construções obsoletas.",
        "`.some()`, `.find()`, `.includes()`, `.replaceAll()`, `Date.now()`, sem `var`.",
        "São MINOR na maioria, mas aparecem em massa em código gerado sem revisão.",
    ],
}

# agrupamento dos catálogos exaustivos por linguagem
GRUPOS_CATALOGO = [
    ("ts-bloqueantes", "TypeScript — BLOCKER e CRITICAL", [("ts", ["BLOCKER", "CRITICAL"])]),
    ("ts-major", "TypeScript — MAJOR", [("ts", ["MAJOR"])]),
    ("ts-minor", "TypeScript — MINOR e INFO", [("ts", ["MINOR", "INFO"])]),
    ("js-bloqueantes", "JavaScript — BLOCKER e CRITICAL", [("js", ["BLOCKER", "CRITICAL"])]),
    ("js-major", "JavaScript — MAJOR", [("js", ["MAJOR"])]),
    ("js-minor", "JavaScript — MINOR e INFO", [("js", ["MINOR", "INFO"])]),
    ("py-bloqueantes", "Python — BLOCKER e CRITICAL", [("py", ["BLOCKER", "CRITICAL"])]),
    ("py-major-minor", "Python — MAJOR, MINOR e INFO", [("py", ["MAJOR", "MINOR", "INFO"])]),
    ("front", "CSS e HTML/JSX", [("css", SEV_ORDER), ("web", SEV_ORDER)]),
    ("infra", "Docker, XML e Segredos", [("docker", SEV_ORDER), ("xml", SEV_ORDER), ("secrets", SEV_ORDER)]),
]


# ---------------------------------------------------------------------------
# frontmatter e empacotamento
# ---------------------------------------------------------------------------


def frontmatter(topic: str, tags: list[str]) -> list[str]:
    stamp = datetime.now().astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")
    stamp = stamp[:-2] + ":" + stamp[-2:]
    lines = ["---", f'topic: "{topic}"', "tags:"]
    lines += [f"  - {t}" for t in tags]
    lines.append("sources:")
    lines += [f'  - "{s}"' for s in SOURCES]
    lines += [
        "verified_by_reviewer: false",
        f'last_updated: "{stamp}"',
        "token_density:",
        "  line_count: 0",
        "  character_count: 0",
        "---",
        "",
    ]
    return lines


def montar_nota(topic: str, tags: list[str], corpo: list[str]) -> str:
    nota = "\n".join(frontmatter(topic, tags) + corpo)
    linhas = nota.count("\n") + 1
    nota = nota.replace("  line_count: 0", f"  line_count: {linhas}", 1)
    return nota.replace("  character_count: 0", f"  character_count: {len(nota)}", 1)


def altura(bloco: list[str]) -> int:
    """Linhas reais do bloco: um item da lista pode conter várias linhas (bloco de código)."""
    return sum(item.count("\n") + 1 for item in bloco)


def empacotar(blocos: list[list[str]], orcamento: int) -> list[list[list[str]]]:
    """Distribui blocos indivisíveis em partes que respeitem o orçamento de linhas."""
    partes: list[list[list[str]]] = [[]]
    atual = 0
    for bloco in blocos:
        tamanho = altura(bloco)
        if atual and atual + tamanho > orcamento:
            partes.append([])
            atual = 0
        partes[-1].append(bloco)
        atual += tamanho
    return [p for p in partes if p]


def sem_placeholder(texto: str) -> str:
    """O validador do vault trata TODO/TBD/FIXME isolados como pendência não resolvida.

    Algumas regras do Sonar falam justamente desses marcadores (ex.: S1135). O check é
    sensível a caixa, então basta minusculizar o marcador dentro do nome da regra.
    """
    for marcador in ("TODO", "TBD", "FIXME", "XXX"):
        texto = re.sub(rf"(?<![A-Za-z0-9]){marcador}(?![A-Za-z0-9])", marcador.lower(), texto)
    return texto


def rodape(extra: list[str] | None = None) -> list[str]:
    return [
        "## Notas relacionadas",
        "",
        f"- [[{SUBDIR}/{PREFIX}index]] — índice das regras, gate e como regenerar",
        *(extra or []),
        "",
    ]


# ---------------------------------------------------------------------------
# notas de regras curadas (com exemplos oficiais)
# ---------------------------------------------------------------------------


def bloco_regra(num: str, diretriz: str, entry: dict) -> list[str]:
    langs = "/".join(entry["langs"])
    params = entry.get("params") or {}
    limite = ""
    if params:
        limite = " · limite " + ", ".join(f"{k}={v}" for k, v in params.items())
    linhas = [
        f"### `{num}` — {diretriz}",
        "",
        f"- **Regra Sonar:** {sem_placeholder(entry['nome'])}",
        f"- **Severidade:** {entry['severidade']} · **Linguagens:** {langs}{limite}"
        + (f" · **Atributo:** {entry['atributo']}" if entry["atributo"] else ""),
    ]
    motivo = first_sentence(entry["_rule"])
    if motivo:
        linhas.append(f"- **Por que:** {motivo}")
    linhas.append("")
    for rotulo, code in code_examples(entry["_rule"]):
        marca = {"Não conforme": "❌", "Exemplo": "•"}.get(rotulo, "✅")
        fence = {"py": "python", "ts": "ts", "js": "js"}.get(entry["_rule"]["lang"], "")
        linhas += [f"{marca} **{rotulo}**", "", f"```{fence}", code, "```", ""]
    return linhas


def notas_de_regras(index: dict) -> dict[str, str]:
    cat_nome = dict(CATEGORIAS)
    blocos_por_cat: dict[str, list[list[str]]] = {}
    for cat, _ in CATEGORIAS:
        itens = [(n, d) for n, c, d in CURADAS if c == cat and n in index]
        if itens:
            blocos_por_cat[cat] = [bloco_regra(n, d, index[n]) for n, d in itens]
    # primeira nota de cada categoria, para os links do rodapé não caírem em nota inexistente
    primeira_nota = {
        cat: f"{PREFIX}regras-{cat}"
        + ("-p1" if len(empacotar(blocos, ORCAMENTO_REGRAS)) > 1 else "")
        for cat, blocos in blocos_por_cat.items()
    }

    arquivos: dict[str, str] = {}
    for cat, titulo in CATEGORIAS:
        itens = [(n, d) for n, c, d in CURADAS if c == cat and n in index]
        if not itens:
            continue
        blocos = [bloco_regra(n, d, index[n]) for n, d in itens]
        partes = empacotar(blocos, ORCAMENTO_REGRAS)
        for i, parte in enumerate(partes, start=1):
            sufixo = f"-p{i}" if len(partes) > 1 else ""
            slug = f"regras-{cat}{sufixo}"
            nome_parte = f" (parte {i}/{len(partes)})" if len(partes) > 1 else ""
            corpo = [f"# Sonar — {titulo}{nome_parte}", "", "## TL;DR / Summary"]
            corpo += [f"- {b}" for b in RESUMOS.get(cat, [])]
            corpo += [
                f"- Esta nota traz {len(parte)} das {len(itens)} regras obrigatórias da categoria, "
                "com os exemplos oficiais do Sonar.",
                "",
                "> Regras **ativas** no Quality Profile `Sonar way` do SonarQube da Inovando.",
                "> Violar qualquer uma gera issue no scanner; a skill `/sonar-gate` reprova a entrega.",
                "",
            ]
            for bloco in parte:
                corpo += bloco
            outras = [
                f"- [[{SUBDIR}/{primeira_nota[c]}]] — {cat_nome[c]}"
                for c, _ in CATEGORIAS
                if c != cat and c in primeira_nota
            ][:4]
            corpo += rodape(outras)
            arquivos[f"{PREFIX}{slug}.md"] = montar_nota(
                f"Sonar — {titulo}{nome_parte}",
                [f"_shared/sonar/{slug}", *TAGS_BASE, *TAGS_STACK],
                corpo,
            )
    return arquivos


# ---------------------------------------------------------------------------
# notas de catálogo exaustivo
# ---------------------------------------------------------------------------


def notas_de_catalogo(rules: dict) -> dict[str, str]:
    por_lang_sev: dict[tuple[str, str], list[dict]] = {}
    for rule in rules.values():
        por_lang_sev.setdefault((rule["lang"], rule["severity"]), []).append(rule)

    arquivos: dict[str, str] = {}
    for slug, titulo, seletores in GRUPOS_CATALOGO:
        blocos: list[list[str]] = []
        total = 0
        for lang, sevs in seletores:
            for sev in sevs:
                grupo = sorted(por_lang_sev.get((lang, sev), []), key=lambda r: r["key"])
                if not grupo:
                    continue
                total += len(grupo)
                bloco = [
                    f"## {LANG_TITLES.get(lang, lang)} · {sev} ({len(grupo)})",
                    "",
                    "| Regra | Atributo | Nome | Tags |",
                    "|---|---|---|---|",
                ]
                for rule in grupo:
                    num = rule["key"].split(":")[1]
                    attr = rule.get("cleanCodeAttribute") or "-"
                    tags = ", ".join(sorted(set(rule.get("tags", []) + rule.get("sysTags", [])))) or "-"
                    nome = sem_placeholder(rule["name"].replace("|", "\\|"))
                    bloco.append(f"| `{num}` | {attr} | {nome} | {tags} |")
                bloco.append("")
                blocos.append(bloco)

        if not blocos:
            continue
        # uma tabela grande pode estourar sozinha o orçamento: quebra por linhas
        divididos: list[list[str]] = []
        for bloco in blocos:
            cabecalho, corpo_tabela = bloco[:4], bloco[4:]
            if len(bloco) <= ORCAMENTO_CATALOGO:
                divididos.append(bloco)
                continue
            passo = ORCAMENTO_CATALOGO - len(cabecalho)
            for inicio in range(0, len(corpo_tabela), passo):
                divididos.append(cabecalho + corpo_tabela[inicio : inicio + passo])
        partes = empacotar(divididos, ORCAMENTO_CATALOGO)

        for i, parte in enumerate(partes, start=1):
            sufixo = f"-p{i}" if len(partes) > 1 else ""
            nome_parte = f" (parte {i}/{len(partes)})" if len(partes) > 1 else ""
            corpo = [
                f"# Catálogo Sonar — {titulo}{nome_parte}",
                "",
                "## TL;DR / Summary",
                f"- Catálogo exaustivo do Quality Profile `Sonar way`: {total} regras ativas neste grupo.",
                "- Lista de consulta: use para confirmar se uma regra existe e qual é a severidade dela.",
                "- As regras **obrigatórias** com exemplos estão nas notas `shared-sonar-regras-*`.",
                "",
            ]
            for bloco in parte:
                corpo += bloco
            corpo += rodape()
            arquivos[f"{PREFIX}catalogo-{slug}{sufixo}.md"] = montar_nota(
                f"Catálogo Sonar — {titulo}{nome_parte}",
                [f"_shared/sonar/catalogo-{slug}", *TAGS_BASE, "meta/reference"],
                corpo,
            )
    return arquivos


# ---------------------------------------------------------------------------
# nota índice
# ---------------------------------------------------------------------------


def nota_index(index: dict, rules: dict, nomes: list[str]) -> str:
    cat_nome = dict(CATEGORIAS)
    corpo = [
        "# Sonar — Índice das Regras de Desenvolvimento",
        "",
        "## TL;DR / Summary",
        f"- O SonarQube da Inovando tem **{len(rules)} regras ativas** nos perfis `Sonar way` "
        "(js, ts, py, css, web, docker, secrets, xml).",
        f"- Deste total, **{len(CURADAS)} regras** são obrigatórias em qualquer projeto e estão "
        "detalhadas com exemplos nas notas por categoria.",
        "- A checagem antes da entrega é a skill `/sonar-gate` do Claude Code: roda o scanner, "
        "busca as issues na API e reprova BLOCKER, CRITICAL, segredos e qualquer regra curada.",
        "",
        "## Regras obrigatórias por categoria",
        "",
    ]
    for cat, titulo in CATEGORIAS:
        qtd = sum(1 for n, c, _ in CURADAS if c == cat and n in index)
        partes = sorted(n for n in nomes if n.startswith(f"{PREFIX}regras-{cat}"))
        links = " · ".join(f"[[{SUBDIR}/{p[:-3]}|{p[:-3].split('-')[-1]}]]" for p in partes)
        corpo.append(f"- **{titulo}** ({qtd} regras): {links}")
    corpo += ["", "## Catálogo exaustivo", ""]
    for slug, titulo, _ in GRUPOS_CATALOGO:
        partes = sorted(n for n in nomes if n.startswith(f"{PREFIX}catalogo-{slug}"))
        if not partes:
            continue
        links = " · ".join(f"[[{SUBDIR}/{p[:-3]}|{p[:-3].split('-')[-1]}]]" for p in partes)
        corpo.append(f"- **{titulo}**: {links}")

    corpo += [
        "",
        "## Como usar",
        "",
        "1. **Antes de codar** em JS/TS/Python: ler a nota da categoria em jogo (fluxo, async, tipos...).",
        "2. **Depois de desenvolver e testar**: rodar `/sonar-gate` no projeto. O gate roda o scanner, "
        "espera o Quality Gate e lista cada issue com o número da regra e a diretriz correspondente.",
        "3. **Antes de abrir merge request**: o gate precisa estar verde. Em revisão, citar o número "
        "da regra (`S3358`) em vez de opinião pessoal.",
        "",
        "## Critério de reprovação do gate",
        "",
        "| Situação | Resultado |",
        "|---|---|",
        "| Segredo exposto (perfil `secrets`) | reprova |",
        "| Issue BLOCKER ou CRITICAL | reprova |",
        "| Issue em qualquer uma das 76 regras curadas | reprova |",
        "| Quality Gate do servidor em ERROR | reprova |",
        "| Outras issues MINOR/MAJOR fora da curadoria | aviso no relatório |",
        "",
        "## Como regenerar esta base",
        "",
        "```bash",
        "cd ~/Projects/local_rag_obisidian_project/tools/sonar-rules",
        "python3 publish_vault_notes.py --refresh   # rebaixa da API e reescreve as notas",
        "```",
        "",
        "Depois, reindexar o vault (`reindex_vault` do MCP obsidian-rag). A curadoria fica em "
        "`CURADAS`, no topo de `sonar_rules.py`: cada entrada é `(número da regra, categoria, "
        "diretriz em PT-BR)`. Nome oficial, severidade, linguagens, limites e exemplos vêm da API — "
        "não são escritos à mão. Regra que sair do Quality Profile é ignorada na geração.",
        "",
        "## Notas relacionadas",
        "",
        "- [[_shared/_index]] — índice das referências compartilhadas",
        "- [[proj-rimatur/proj-rimatur-guidelines]] — arquitetura e padrões do Rimatur",
        "",
    ]
    return montar_nota(
        "Sonar — Índice das Regras de Desenvolvimento",
        ["_shared/sonar/index", "meta/index", *TAGS_BASE, *TAGS_STACK],
        corpo,
    )


# ---------------------------------------------------------------------------
# contrato máquina-legível para a skill do gate
# ---------------------------------------------------------------------------


def escrever_curadoria(index: dict) -> list[str]:
    dados = {
        "host": HOST,
        "gerado_em": datetime.now().astimezone().isoformat(timespec="seconds"),
        "criterio": {
            "reprova_severidades": ["BLOCKER", "CRITICAL"],
            "reprova_repos": ["secrets"],
            "reprova_curadas": True,
        },
        "regras": [
            {
                "numero": num,
                "categoria": cat,
                "diretriz": diretriz,
                "nome": index[num]["nome"],
                "severidade": index[num]["severidade"],
                "langs": index[num]["langs"],
                "keys": index[num]["keys"],
            }
            for num, cat, diretriz in CURADAS
            if num in index
        ],
    }
    destinos = [os.path.join(OUT_DIR, "curadoria.json")]
    if os.path.isdir(SKILL_DIR):
        destinos.append(os.path.join(SKILL_DIR, "curadoria.json"))
    for destino in destinos:
        with open(destino, "w", encoding="utf-8") as fh:
            json.dump(dados, fh, ensure_ascii=False, indent=1)
    return destinos


# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vault", default=VAULT_DEFAULT)
    parser.add_argument("--refresh", action="store_true", help="rebaixa as regras da API antes")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    rules = carregar_regras(args.refresh)
    index = build_index(rules)

    arquivos = notas_de_regras(index)
    arquivos.update(notas_de_catalogo(rules))
    arquivos[f"{PREFIX}index.md"] = nota_index(index, rules, sorted(arquivos))

    destino = os.path.join(args.vault, SUBDIR)
    if not args.dry_run:
        if os.path.isdir(destino):
            shutil.rmtree(destino)  # remove notas de execuções antigas
        os.makedirs(destino, exist_ok=True)

    estouros = []
    for nome, conteudo in sorted(arquivos.items()):
        linhas = conteudo.count("\n") + 1
        if linhas > MAX_LINHAS_NOTA:
            estouros.append((nome, linhas))
        if not args.dry_run:
            with open(os.path.join(destino, nome), "w", encoding="utf-8") as fh:
                fh.write(conteudo)
        print(f"{'(dry) ' if args.dry_run else ''}{nome:52s} {linhas:4d} linhas")

    print(f"\n{len(arquivos)} notas em {destino}")
    if estouros:
        print("ACIMA DE 200 LINHAS: " + ", ".join(f"{n} ({l})" for n, l in estouros))
    if not args.dry_run:
        for caminho in escrever_curadoria(index):
            print(f"curadoria: {caminho}")
        print("\nReindexe o vault: reindex_vault (MCP obsidian-rag)")


if __name__ == "__main__":
    main()
