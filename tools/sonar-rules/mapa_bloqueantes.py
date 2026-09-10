#!/usr/bin/env python3
"""Mapeia as issues bloqueantes de um projeto: arquivo, linha, causa e frescor da informação.

Cruza as issues abertas no SonarQube com o git local para separar o que ainda é real do que
pode já ter sido corrigido depois da última análise publicada no servidor:

    intocado         arquivo não mudou desde a análise -> issue ainda válida
    pode-estar-fixo  arquivo mudou depois da análise    -> precisa de nova análise
    obsoleto         arquivo não existe mais            -> issue morta

Uso:
    python3 mapa_bloqueantes.py --repo ~/Projects/Rimatur/next-portal-rimatur [--vault ...]

Gera notas datadas em `proj-<projeto>/sonar/` no vault (auditoria, não referência perene).
"""

from __future__ import annotations

import argparse
import base64
import collections
import json
import os
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

from publish_vault_notes import MAX_LINHAS_NOTA, VAULT_DEFAULT, montar_nota
from sonar_rules import SEV_ORDER

ORCAMENTO_TABELA = 120


def props(repo: str) -> dict[str, str]:
    caminho = os.path.join(repo, "sonar-project.properties")
    if not os.path.exists(caminho):
        raise SystemExit(f"{caminho} não encontrado.")
    dados = {}
    with open(caminho, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                chave, valor = line.split("=", 1)
                dados[chave.strip()] = valor.strip()
    return dados


class Sonar:
    def __init__(self, host: str, token: str) -> None:
        self.host = host.rstrip("/")
        self.auth = base64.b64encode(f"{token}:".encode()).decode()

    def get(self, path: str, **params) -> dict:
        if params:
            path += "?" + urllib.parse.urlencode(
                {k: v for k, v in params.items() if v is not None}
            )
        req = urllib.request.Request(
            self.host + path, headers={"Authorization": "Basic " + self.auth}
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            raise SystemExit(f"HTTP {exc.code} em {path}: {exc.read().decode()[:200]}")

    def issues(self, project: str) -> list[dict]:
        todas, page = [], 1
        while True:
            data = self.get(
                "/api/issues/search", components=project, resolved="false", ps=500, p=page
            )
            todas += data.get("issues", [])
            if page * data.get("ps", 500) >= min(data.get("total", 0), 10000) or not data.get("issues"):
                return todas
            page += 1

    def data_ultima_analise(self, project: str) -> str:
        branches = self.get("/api/project_branches/list", project=project).get("branches", [])
        principal = next((b for b in branches if b.get("isMain")), branches[0] if branches else {})
        return (principal.get("analysisDate") or "")[:19], principal.get("name", "?")


def git(repo: str, *args: str) -> str:
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True).stdout.strip()


def frescor(repo: str, arquivo: str, corte: str) -> tuple[str, str]:
    if not os.path.exists(os.path.join(repo, arquivo)):
        return "obsoleto", "-"
    data = git(repo, "log", "-1", "--format=%cI", "--", arquivo)[:10]
    if not data:
        return "intocado", "-"
    return ("pode-estar-fixo" if data > corte[:10] else "intocado"), data


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--vault", default=VAULT_DEFAULT)
    parser.add_argument("--projeto-vault", default="proj-rimatur")
    parser.add_argument("--curadoria", default=os.path.expanduser("~/.claude/skills/sonar-gate/curadoria.json"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    repo = os.path.abspath(os.path.expanduser(args.repo))
    nome_repo = os.path.basename(repo)
    conf = props(repo)
    projeto = conf["sonar.projectKey"]
    sonar = Sonar(os.environ.get("SONAR_HOST") or conf["sonar.host.url"],
                  os.environ.get("SONAR_TOKEN") or conf["sonar.token"])

    with open(args.curadoria, encoding="utf-8") as fh:
        curadoria = json.load(fh)
    criterio = curadoria["criterio"]
    por_numero = {r["numero"]: r for r in curadoria["regras"]}
    reprova_sev = set(criterio["reprova_severidades"])
    reprova_repos = set(criterio["reprova_repos"])

    analise, branch = sonar.data_ultima_analise(projeto)
    issues = sonar.issues(projeto)

    bloqueantes = []
    for issue in issues:
        regra = issue.get("rule", "")
        num = regra.split(":")[-1]
        sev = issue.get("severity", "MAJOR")
        curada = por_numero.get(num)
        if not (regra.split(":")[0] in reprova_repos or sev in reprova_sev or curada):
            continue
        arquivo = (issue.get("component") or "").split(":", 1)[-1]
        estado, data_arq = frescor(repo, arquivo, analise)
        bloqueantes.append(
            {
                "arquivo": arquivo,
                "linha": issue.get("line") or 0,
                "regra": num,
                "severidade": sev,
                "mensagem": issue.get("message", ""),
                "causa": curada["diretriz"] if curada else issue.get("message", ""),
                "nome_regra": curada["nome"] if curada else "",
                "estado": estado,
                "arquivo_alterado_em": data_arq,
            }
        )

    ordem_sev = {s: i for i, s in enumerate(SEV_ORDER)}
    bloqueantes.sort(key=lambda i: (ordem_sev.get(i["severidade"], 9), i["arquivo"], i["linha"]))

    por_estado = collections.Counter(i["estado"] for i in bloqueantes)
    por_regra = collections.Counter(i["regra"] for i in bloqueantes)
    por_arquivo = collections.Counter(i["arquivo"] for i in bloqueantes)
    hoje = datetime.now().strftime("%Y-%m-%d")

    # ---------------- nota de resumo ----------------
    resumo = [
        f"# Auditoria {hoje} — Bloqueantes do Sonar em {nome_repo}",
        "",
        "## TL;DR / Summary",
        f"- **{len(bloqueantes)} issues bloqueantes** em {len(por_arquivo)} arquivos, segundo a última "
        f"análise publicada da branch `{branch}`: **{analise}**.",
        f"- Frescor: {por_estado.get('intocado', 0)} em arquivos intocados desde a análise (ainda reais), "
        f"{por_estado.get('pode-estar-fixo', 0)} em arquivos alterados depois (podem já estar corrigidas), "
        f"{por_estado.get('obsoleto', 0)} em arquivos que não existem mais.",
        "- Critério de bloqueio: segredo exposto, BLOCKER, CRITICAL ou violação de regra obrigatória.",
        "",
        "## Distribuição por regra",
        "",
        "| Regra | Issues | Causa |",
        "|---|---|---|",
    ]
    for num, qtd in por_regra.most_common():
        exemplo = next(i for i in bloqueantes if i["regra"] == num)
        resumo.append(f"| `{num}` | {qtd} | {exemplo['causa']} |")
    resumo += [
        "",
        "## Arquivos com mais issues",
        "",
        "| Arquivo | Issues | Estado |",
        "|---|---|---|",
    ]
    for arquivo, qtd in por_arquivo.most_common(15):
        estado = next(i["estado"] for i in bloqueantes if i["arquivo"] == arquivo)
        resumo.append(f"| `{arquivo}` | {qtd} | {estado} |")
    resumo += [
        "",
        "## Como ler o estado",
        "",
        "- `intocado` — o arquivo não mudou desde a análise: a issue continua real.",
        "- `pode-estar-fixo` — o arquivo mudou depois da análise: só uma nova análise confirma.",
        "- `obsoleto` — o arquivo não existe mais no repositório.",
        "",
        "## Notas relacionadas",
        "",
        f"- [[_shared/sonar/shared-sonar-index]] — regras obrigatórias e critério do gate",
        "",
    ]

    arquivos_nota: dict[str, str] = {}
    slug = f"auditoria-{hoje}-bloqueantes-{nome_repo}"
    arquivos_nota[f"{slug}.md"] = montar_nota(
        f"Auditoria {hoje} — Bloqueantes do Sonar em {nome_repo}",
        [f"{args.projeto_vault}/sonar/auditoria", "quality/sonarqube", "meta/audit"],
        resumo,
    )

    # ---------------- notas de mapeamento detalhado ----------------
    linhas_tabela = [
        f"| `{i['arquivo']}` | {i['linha'] or '-'} | `{i['regra']}` | {i['severidade']} | "
        f"{i['estado']} | {i['mensagem'].replace('|', '/')} |"
        for i in bloqueantes
    ]
    cabecalho = [
        "| Arquivo | Linha | Regra | Sev. | Estado | Mensagem do Sonar |",
        "|---|---|---|---|---|---|",
    ]
    total_partes = max(1, -(-len(linhas_tabela) // ORCAMENTO_TABELA))
    for parte in range(total_partes):
        trecho = linhas_tabela[parte * ORCAMENTO_TABELA : (parte + 1) * ORCAMENTO_TABELA]
        sufixo = f"-p{parte + 1}" if total_partes > 1 else ""
        nome_parte = f" (parte {parte + 1}/{total_partes})" if total_partes > 1 else ""
        corpo = [
            f"# Mapa {hoje} — Bloqueantes por arquivo em {nome_repo}{nome_parte}",
            "",
            "## TL;DR / Summary",
            f"- Mapeamento arquivo:linha das issues bloqueantes, ordenado por severidade.",
            f"- Base: análise da branch `{branch}` de {analise}. Resumo e frescor em "
            f"[[{args.projeto_vault}/sonar/{slug}]].",
            f"- Esta parte cobre {len(trecho)} das {len(linhas_tabela)} issues.",
            "",
            *cabecalho,
            *trecho,
            "",
            "## Notas relacionadas",
            "",
            f"- [[{args.projeto_vault}/sonar/{slug}]] — resumo, distribuição por regra e frescor",
            "",
        ]
        arquivos_nota[f"mapa-{hoje}-bloqueantes-{nome_repo}{sufixo}.md"] = montar_nota(
            f"Mapa {hoje} — Bloqueantes por arquivo em {nome_repo}{nome_parte}",
            [f"{args.projeto_vault}/sonar/mapa", "quality/sonarqube", "meta/audit"],
            corpo,
        )

    destino = os.path.join(args.vault, args.projeto_vault, "sonar")
    if not args.dry_run:
        os.makedirs(destino, exist_ok=True)
    for nome, conteudo in sorted(arquivos_nota.items()):
        linhas = conteudo.count("\n") + 1
        alerta = "  ACIMA DE 200 LINHAS" if linhas > MAX_LINHAS_NOTA else ""
        print(f"{'(dry) ' if args.dry_run else ''}{nome:56s} {linhas:4d} linhas{alerta}")
        if not args.dry_run:
            with open(os.path.join(destino, nome), "w", encoding="utf-8") as fh:
                fh.write(conteudo)

    print(f"\n{nome_repo}: {len(bloqueantes)} bloqueantes · análise de {analise} (branch {branch})")
    print("frescor:", dict(por_estado))


if __name__ == "__main__":
    main()
