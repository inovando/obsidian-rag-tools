#!/usr/bin/env python3
"""Biblioteca de acesso as regras do SonarQube e curadoria das regras obrigatorias.

Nao gera documentacao: quem publica as notas do vault e `publish_vault_notes.py`,
quem checa um projeto e a skill `sonar-gate`. Este modulo concentra:

    - acesso a API do SonarQube (regras ativas por Quality Profile)
    - cache local do dump bruto (out/sonar_active_rules.json)
    - indice consolidado por numero de regra (S3358 -> nome/severidade/linguagens)
    - CURADAS: as regras obrigatorias, com a diretriz em PT-BR
    - conversao das descricoes oficiais (HTML) para markdown

Credenciais (nesta ordem): variavel SONAR_TOKEN, arquivo ~/.config/sonar-rules/token,
ou `sonar.token` de um sonar-project.properties no diretorio atual.
"""

from __future__ import annotations

import base64
import html
import json
import os
import re
import time
import urllib.error
import urllib.request
from collections import defaultdict

HOST = os.environ.get("SONAR_HOST", "https://sonarqube.inovan.do")
PROJECT_KEY = os.environ.get(
    "SONAR_PROJECT_KEY", "rimatur_next-portal-rimatur_46581b53-06e1-4a76-ab1b-0c1746efb85d"
)
TOKEN_FILE = os.path.expanduser("~/.config/sonar-rules/token")


def resolver_token(properties_path: str = "sonar-project.properties") -> str:
    """Token do SonarQube, sem segredo versionado no repositorio."""
    if os.environ.get("SONAR_TOKEN"):
        return os.environ["SONAR_TOKEN"].strip()
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, encoding="utf-8") as fh:
            return fh.read().strip()
    if os.path.exists(properties_path):
        with open(properties_path, encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("sonar.token="):
                    return line.split("=", 1)[1].strip()
    raise SystemExit(
        "Token do SonarQube nao encontrado. Defina SONAR_TOKEN, crie "
        f"{TOKEN_FILE} ou rode dentro de um projeto com sonar-project.properties."
    )

# Linguagens dos projetos Rimatur (api = js, portal = ts/css/web, infra = docker/xml)
LANGS = ("js", "ts", "py", "css", "web", "docker", "secrets", "xml")

FIELDS = ",".join(
    [
        "repo", "name", "severity", "lang", "langName", "status", "tags", "sysTags",
        "descriptionSections", "cleanCodeAttribute", "remFn", "params", "createdAt",
        "deprecatedKeys", "educationPrinciples", "scope",
    ]
)

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
RAW_PATH = os.path.join(OUT_DIR, "sonar_active_rules.json")

SEV_ORDER = ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"]

LANG_TITLES = {
    "js": "JavaScript",
    "ts": "TypeScript",
    "py": "Python",
    "css": "CSS",
    "web": "HTML/JSX",
    "docker": "Docker",
    "secrets": "Segredos",
    "xml": "XML",
}

# ---------------------------------------------------------------------------
# Curadoria: regras que mais afetam código gerado por IA e revisão humana.
# (número da regra, categoria, diretriz em PT-BR imperativa)
# Nome oficial, severidade, linguagens e exemplos vêm da API — não são escritos aqui.
# ---------------------------------------------------------------------------
CATEGORIAS = [
    ("fluxo", "Fluxo de controle e early return"),
    ("complexidade", "Complexidade e tamanho"),
    ("duplicacao", "Duplicação e código morto"),
    ("condicionais", "Condicionais e comparações"),
    ("async", "Async, Promises e concorrência"),
    ("erros", "Tratamento de erros"),
    ("tipos", "TypeScript e tipagem"),
    ("react", "React e JSX"),
    ("modernidade", "APIs modernas e simplificação"),
]

CURADAS: list[tuple[str, str, str]] = [
    # --- fluxo de controle / early return -----------------------------------
    ("S3358", "fluxo", "Nunca aninhe ternários. Extraia para `if/else`, early return ou uma função/mapa auxiliar."),
    ("S6660", "fluxo", "Não coloque um `if` como única instrução dentro de um `else`: use `else if`."),
    ("S1126", "fluxo", "Retorne a expressão booleana direto (`return a && b`) em vez de `if (x) return true; else return false;`."),
    ("S3626", "fluxo", "Remova `return`, `continue` e `break` redundantes (no fim da função ou do loop eles não fazem nada)."),
    ("S3516", "fluxo", "Se a função sempre retorna o mesmo valor, remova os ramos inúteis ou o próprio retorno."),
    ("S7735", "fluxo", "Com `else` presente, use a condição positiva primeiro: `if (ok) {...} else {...}`, não `if (!ok)`."),
    ("S1940", "fluxo", "Não inverta comparações com `!`: escreva `a !== b`, nunca `!(a === b)`."),
    ("S1199", "fluxo", "Não use blocos `{}` soltos para agrupar código; extraia uma função."),
    ("S1763", "fluxo", "Não deixe código depois de `return`/`throw`/`continue`: é código inalcançável."),
    ("S1066", "fluxo", "Combine `if` aninhados em uma única condição (`if a and b`) quando não houver `else`."),
    ("S1301", "fluxo", "Com 1 ou 2 casos, use `if/else` em vez de `switch`."),
    ("S6644", "fluxo", "Não use ternário onde `??`, `||` ou a própria expressão booleana resolvem."),
    # --- complexidade --------------------------------------------------------
    ("S3776", "complexidade", "Mantenha a complexidade cognitiva ≤ 15 por função: use guard clauses e early return e extraia funções auxiliares em vez de aninhar `if`."),
    ("S2004", "complexidade", "Não aninhe funções acima de 4 níveis (callback dentro de callback dentro de callback). Nomeie e extraia."),
    ("S107", "complexidade", "No máximo 7 parâmetros por função. Acima disso, receba um objeto de parâmetros."),
    ("S1479", "complexidade", "`switch` com muitos `case` deve virar mapa/objeto de estratégias."),
    ("S4624", "complexidade", "Não aninhe template literals; monte a string em variáveis intermediárias."),
    ("S1515", "complexidade", "Não declare funções dentro de loops; declare fora e reutilize."),
    # --- duplicação / código morto ------------------------------------------
    ("S1871", "duplicacao", "Dois ramos de `if/else` ou dois `case` com a mesma implementação: unifique a condição ou remova o ramo."),
    ("S4144", "duplicacao", "Duas funções com corpo idêntico: extraia uma só e reutilize."),
    ("S4165", "duplicacao", "Não reatribua o mesmo valor a uma variável (atribuição redundante)."),
    ("S1854", "duplicacao", "Remova atribuições cujo valor nunca é lido."),
    ("S1481", "duplicacao", "Remova variáveis e funções locais não utilizadas."),
    ("S1128", "duplicacao", "Remova imports não utilizados."),
    ("S1068", "duplicacao", "Remova membros privados de classe que ninguém usa."),
    ("S125", "duplicacao", "Não deixe código comentado: apague (o histórico fica no git)."),
    ("S1186", "duplicacao", "Não deixe funções vazias; se o no-op é intencional, documente o motivo no corpo."),
    ("S905", "duplicacao", "Toda instrução deve ter efeito: remova expressões soltas sem side effect."),
    # --- condicionais e comparações -----------------------------------------
    ("S1125", "condicionais", "Não compare com literais booleanos: `if (ativo)`, nunca `if (ativo === true)`."),
    ("S2589", "condicionais", "Remova condições sempre verdadeiras ou sempre falsas (checagem já garantida antes)."),
    ("S1764", "condicionais", "Não repita a mesma expressão nos dois lados de um operador binário."),
    ("S1862", "condicionais", "Não repita a mesma condição em cadeia `if/else if` nem em dois `case`."),
    ("S7736", "condicionais", "Não negue expressões dentro de comparações de igualdade."),
    ("S888", "condicionais", "Em `for`, use `<`/`>` na condição de parada, não `!==`/`===`."),
    ("S2692", "condicionais", "`indexOf` deve ser comparado com `-1` ou `>= 0`, nunca com `> 0`."),
    # --- async ---------------------------------------------------------------
    ("S4123", "async", "Só use `await` em Promises; `await` em valor síncrono é ruído e mascara bugs."),
    ("S6544", "async", "Não use Promise onde se espera valor síncrono nem passe função `async` para callback que ignora o retorno."),
    ("S4634", "async", "Use `Promise.resolve(x)` / `Promise.reject(e)` em vez de `new Promise(...)` trivial."),
    ("S7746", "async", "Dentro de `async`, use `return x` / `throw e` em vez de `Promise.resolve` / `Promise.reject`."),
    ("S1143", "async", "Nunca use `return`/`throw`/`break` dentro de `finally`: descarta a exceção original."),
    ("S7738", "async", "Não passe array de 1 elemento para `Promise.all`/`race`: use `await` direto."),
    ("S7785", "async", "Prefira `await` no topo do módulo a IIFE `async` autoinvocada."),
    # --- erros ---------------------------------------------------------------
    ("S2486", "erros", "Não engula exceções: trate, registre com contexto ou repropague."),
    ("S2737", "erros", "`catch` que só faz `throw e` deve ser removido."),
    ("S3696", "erros", "Lance objetos `Error`, nunca literais (`throw 'erro'`)."),
    ("S3984", "erros", "`new Error(...)` sem `throw` não faz nada."),
    ("S7722", "erros", "Todo `Error` precisa de mensagem descritiva com contexto."),
    ("S7786", "erros", "Use `TypeError` (e não `Error` genérico) depois de uma checagem de tipo."),
    # --- TypeScript ----------------------------------------------------------
    ("S4325", "tipos", "Remova casts e `!` non-null redundantes."),
    ("S6568", "tipos", "Não use `!` non-null de forma enganosa; trate o `null` explicitamente."),
    ("S6571", "tipos", "Remova constituintes redundantes de unions e intersections (`string | any`)."),
    ("S4782", "tipos", "Em propriedade opcional use `?` ou `| undefined`, nunca os dois."),
    ("S6606", "tipos", "Use `??` em vez de `||` quando o fallback é para null/undefined."),
    ("S6582", "tipos", "Use optional chaining (`a?.b`) em vez de `a && a.b`."),
    ("S6598", "tipos", "Prefira tipo de função (`type F = () => void`) a interface com uma única call signature."),
    ("S3800", "tipos", "Uma função deve sempre retornar o mesmo tipo."),
    ("S2933", "tipos", "Campos atribuídos somente no construtor devem ser `readonly`."),
    ("S4335", "tipos", "Não faça intersection com tipos sem significado (`any`, `never`)."),
    # --- React ---------------------------------------------------------------
    ("S6479", "react", "Nunca use o índice do array como `key` em lista JSX; use um id estável."),
    ("S6478", "react", "Não declare componente dentro de componente; mova para fora."),
    ("S6481", "react", "Valor de Context Provider precisa de identidade estável (`useMemo`)."),
    ("S6749", "react", "Remova fragmentos JSX (`<>...</>`) redundantes."),
    # --- APIs modernas -------------------------------------------------------
    ("S3504", "modernidade", "Use `const`/`let`, nunca `var`."),
    ("S2871", "modernidade", "`sort()` sempre com função de comparação (o padrão é lexicográfico)."),
    ("S7754", "modernidade", "Use `.some()` em vez de `.filter().length > 0`."),
    ("S7750", "modernidade", "Use `.find()`/`.findLast()` em vez de `.filter()[0]`."),
    ("S7765", "modernidade", "Use `.includes()` em vez de `.indexOf() !== -1`."),
    ("S7781", "modernidade", "Use `.replaceAll()` em vez de `.replace()` com regex global."),
    ("S7747", "modernidade", "Remova spread desnecessário (`[...array]` sem motivo)."),
    ("S7759", "modernidade", "Use `Date.now()` em vez de `new Date().getTime()`."),
    ("S7741", "modernidade", "Use `=== undefined` em vez de `typeof x === 'undefined'`."),
    ("S7760", "modernidade", "Use parâmetro default em vez de reatribuir parâmetro com fallback."),
    ("S1121", "modernidade", "Não faça atribuição dentro de subexpressão (`if ((x = f()))`)."),
    ("S878", "modernidade", "Não use o operador vírgula."),
    ("S1533", "modernidade", "Não use objetos wrapper (`new Number`, `new String`) para primitivos."),
    ("S6859", "modernidade", "Não importe por caminho absoluto do sistema de arquivos; use alias ou caminho relativo."),
]

# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


def api_get(path: str, token: str | None = None) -> dict:
    auth = base64.b64encode(f"{token or resolver_token()}:".encode()).decode()
    req = urllib.request.Request(HOST + path, headers={"Authorization": "Basic " + auth})
    last = ""
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            raise SystemExit(f"HTTP {exc.code} em {path}: {exc.read().decode()[:300]}")
        except Exception as exc:  # rede instável
            last = str(exc)
            time.sleep(2)
    raise SystemExit(f"Falha de conexão em {path}: {last}")


def fetch_rules() -> dict:
    profiles = api_get(f"/api/qualityprofiles/search?project={PROJECT_KEY}")["profiles"]
    rules: dict[str, dict] = {}
    for prof in profiles:
        if prof["language"] not in LANGS or prof["activeRuleCount"] == 0:
            continue
        page = 1
        before = len(rules)
        while True:
            data = api_get(
                f"/api/rules/search?activation=true&qprofile={prof['key']}"
                f"&ps=500&p={page}&f={FIELDS}"
            )
            for rule in data.get("rules", []):
                rule["_profile"] = prof["name"]
                rules[rule["key"]] = rule
            if page * data.get("ps", 500) >= data.get("total", 0) or not data.get("rules"):
                break
            page += 1
        print(f"  {prof['language']:8s} {prof['name']:12s} {len(rules) - before:4d} regras ativas")
    return rules


# ---------------------------------------------------------------------------
# HTML -> markdown
# ---------------------------------------------------------------------------

PRE_RE = re.compile(r"<pre[^>]*>(.*?)</pre>", re.S)
TAG_RE = re.compile(r"<[^>]+>")


def strip_tags(fragment: str) -> str:
    text = re.sub(r"<li[^>]*>", "\n- ", fragment)
    text = re.sub(r"</p>|<br\s*/?>", "\n", text)
    text = TAG_RE.sub("", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    return "\n".join(line.strip() for line in text.split("\n") if line.strip())


def section(rule: dict, key: str) -> str:
    for sec in rule.get("descriptionSections", []):
        if sec.get("key") == key:
            return sec.get("content", "")
    return ""


def first_sentence(rule: dict) -> str:
    for key in ("root_cause", "introduction", "default", "how_to_fix"):
        raw = section(rule, key)
        if not raw:
            continue
        text = strip_tags(PRE_RE.sub(" ", raw))
        if text:
            return re.split(r"(?<=[.!?])\s+", text)[0][:240].replace("\n", " ")
    return ""


def code_examples(rule: dict, max_blocks: int = 2, max_lines: int = 14) -> list[tuple[str, str]]:
    """Devolve [(rótulo, código)] extraídos das seções oficiais da regra."""

    def blocos_da_secao(secao_key: str) -> list[str]:
        found: list[str] = []
        for match in PRE_RE.findall(section(rule, secao_key)):
            code = html.unescape(TAG_RE.sub("", match)).strip("\n")
            lines = [ln.rstrip() for ln in code.split("\n")]
            if len(lines) > max_lines:
                lines = lines[:max_lines] + ["// ..."]
            code = "\n".join(lines).strip()
            if code and code not in found:
                found.append(code)
        return found

    # Nunca misturar seções: par antes/depois só faz sentido dentro da mesma seção.
    candidatos = [blocos_da_secao(k) for k in ("root_cause", "how_to_fix", "default", "introduction")]
    blocks = next((b for b in candidatos if len(b) >= 2), None)
    if blocks is None:
        blocks = next((b for b in candidatos if b), [])
    blocks = blocks[:max_blocks]

    marcados = [bool(re.search(r"oncompliant", code)) for code in blocks]
    if any(marcados):
        # a própria regra marca o exemplo ruim com "Noncompliant"
        return [
            ("Não conforme", code) if ruim else ("Conforme", code)
            for code, ruim in zip(blocks, marcados)
        ]
    # sem marcador explícito não há como afirmar qual é o conforme: rótulo neutro
    return [("Exemplo", code) for code in blocks]


# ---------------------------------------------------------------------------
# Geração de documentos
# ---------------------------------------------------------------------------


def build_index(rules: dict) -> dict[str, dict]:
    """Consolida por número de regra (S3358), unindo as linguagens."""
    index: dict[str, dict] = {}
    for key, rule in rules.items():
        num = key.split(":")[1]
        entry = index.setdefault(
            num,
            {
                "numero": num,
                "nome": rule["name"],
                "severidade": rule["severity"],
                "atributo": rule.get("cleanCodeAttribute"),
                "categoria_clean_code": rule.get("cleanCodeAttributeCategory"),
                "langs": [],
                "keys": [],
                "tags": sorted(set(rule.get("tags", []) + rule.get("sysTags", []))),
                "params": {p["key"]: p.get("defaultValue") for p in rule.get("params", [])},
                "_rule": rule,
            },
        )
        entry["langs"].append(rule["lang"])
        entry["keys"].append(key)
        if SEV_ORDER.index(rule["severity"]) < SEV_ORDER.index(entry["severidade"]):
            entry["severidade"] = rule["severity"]
        # prioriza a descrição de ts/js, mais completa para os projetos Rimatur
        if rule["lang"] in ("ts", "js") and entry["_rule"]["lang"] not in ("ts", "js"):
            entry["_rule"] = rule
    for entry in index.values():
        entry["langs"] = sorted(set(entry["langs"]))
        entry["keys"] = sorted(set(entry["keys"]))
    return index


def gerado_em(rules: dict) -> str:
    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")
    return (
        f"> Gerado por `tools/sonar-rules/extract_sonar_rules.py` em {stamp} · "
        f"{len(rules)} regras ativas · perfis `Sonar way` de {HOST}\n"
    )


def carregar_regras(refresh: bool = False) -> dict:
    """Regras ativas: do cache local ou da API quando `refresh` ou sem cache."""
    os.makedirs(OUT_DIR, exist_ok=True)
    if refresh or not os.path.exists(RAW_PATH):
        print(f"Baixando regras ativas de {HOST} ...")
        rules = fetch_rules()
        with open(RAW_PATH, "w", encoding="utf-8") as fh:
            json.dump(rules, fh, ensure_ascii=False)
        return rules
    with open(RAW_PATH, encoding="utf-8") as fh:
        rules = json.load(fh)
    print(f"Cache: {RAW_PATH} ({len(rules)} regras). Use --refresh para atualizar.")
    return rules


def main() -> None:
    """Atualiza o cache local e o indice consultavel por numero de regra."""
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="rebaixa as regras da API")
    args = parser.parse_args()

    rules = carregar_regras(args.refresh)
    index = build_index(rules)
    destino = os.path.join(OUT_DIR, "regras.index.json")
    with open(destino, "w", encoding="utf-8") as fh:
        json.dump(
            {k: {x: y for x, y in v.items() if x != "_rule"} for k, v in index.items()},
            fh, ensure_ascii=False, indent=1,
        )
    curadas = sum(1 for n, _, _ in CURADAS if n in index)
    print(f"{len(rules)} regras ativas - {len(index)} numeros unicos - curadas: {curadas}/{len(CURADAS)}")
    print(destino)


if __name__ == "__main__":
    main()
