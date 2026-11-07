# GamesList — Integrante A

> Avaliação Git/GitHub · equipe de 3 · issues **#1, #8, #5, #6**
> Nome: [preencher] · Colegas: B [nome], C [nome]
> Leia a Parte 1 (suas tarefas) e consulte a Parte 2 (guia comum) quando precisar.

# PARTE 1 — SUAS TAREFAS

## 1.1 Visão geral

| Ordem | Ciclo | Posição no merge | Issue | Tag | Depende de | Libera |
|---|---|---|---|---|---|---|
| 1ª | 1 | **1º** | **#1** Estrutura Web | v0.1.0 | nada | **todas as outras** |
| 2ª | 2 | 2º (depois de B) | **#8** Cadastro/edição CLI | v0.5.0 | #7 (B), #2 (B) | — |
| 3ª | 3 | 3º (depois de C e B) | **#5** Exportação CSV Web | v0.9.0 | #4 (C) | #11 (C) |
| 4ª | 4 | **1º** | **#6** Dashboard Web | v0.10.0 | #1 | #12 (B) |

**Você é o gargalo do projeto.** A #1 destrava B e C. Entregue a PR da #1 no **dia 1** e publique a branch para os dois começarem em cima dela. A #6 abre o ciclo 4, então B (#12) depende de você.

## 1.2 Issue #1: Estrutura Web (ciclo 1, merge 1º)

**Objetivo:** esqueleto completo que todos vão usar: API, banco, login, Web inicial, Docker e testes.

**Arquivos de produção:** `index.html`, `Program.cs` (API), `Db.cs`, `README.md`.
**Auxiliares (justificar na PR):** `GamesList.sln` (solução), `GamesList.Api.csproj`, `Dockerfile` da API, `docker-compose.yml` (serviços `api` e `tests`), `.env.example`, `.gitignore` (template .NET, o de Node não serve), `tests/GamesList.Tests/*` (xUnit + coverlet), `.github/PULL_REQUEST_TEMPLATE.md`, remoção do template antigo (`GamesList.http`, `appsettings*`).

**O que fazer:**
1. Reorganizar para `src/GamesList.Api/` e `tests/GamesList.Tests/` (a pasta `src/GamesList/` atual é só o template e sai).
2. **API (`Program.cs`):**
   - middleware que gera o `request_id` e loga a linha `api`;
   - `GET /api/web/health` (200, público);
   - `POST /api/web/login` (usuário e senha → `{"token"}`; 401 se inválido);
   - `TokenStore.Issue/Validate` e o filtro de autenticação para rotas protegidas (todos vão reusar);
   - servir `wwwroot/index.html` na raiz.
3. **Banco (`Db.cs`):**
   - classe estática `Logger` (formato da 2.7);
   - criação do esquema **completo** (`games` e `users`, ver 2.4);
   - criação do usuário inicial a partir das variáveis `GAMESLIST_ADMIN_USER`/`PASSWORD`, com hash PBKDF2;
   - `WebCheckCredentials(user, pass, client, requestId)` com log `db`.
4. **Web (`index.html`):** tela de login, depois uma tela inicial (shell) com abas vazias: Cadastro, Listagem, Busca, Dashboard. Guarda o token em `sessionStorage`.
5. **Blocos por issue:** criar em `Program.cs`, `Db.cs`, `index.html` e `README.md` os blocos `===== #N inicio/fim =====` para **todas as 12 issues** (ver 2.3). Isso evita conflito entre vocês.
6. **Docker:** `docker compose up --build` sobe a API (porta 8080) com volume para o SQLite. `docker compose run --rm tests` roda os testes com cobertura de linhas e **falha abaixo de 100%** (coverlet `Threshold=100`, `ThresholdType=line`, incluindo só a API).
7. **Testes:** health, login ok/falha, token válido/inválido, hash de senha, log (formato e `request_id`).
8. **README:** seção "#1 Como iniciar a Web" (clonar, copiar `.env.example` para `.env`, `docker compose up --build`, abrir `http://localhost:8080`, login, como ver logs, como rodar testes).

**Aceite (da spec):** página inicial e login, API e banco, `GET /api/web/health` retorna 200, `POST /api/web/login` funciona, usuário inicial configurável, `docker compose up` funciona, README explica início e login.

**Cuidados:**
- Nunca commitar `.env`, senhas ou tokens. O `.env.example` leva só valores fictícios.
- Esta PR carrega a reorganização e o `.gitignore` novo. Liste e justifique cada um.
- Depois do merge: tag **v0.1.0** + release "Estrutura Web (#1, PR #x)".

## 1.3 Issue #8: Cadastro/edição na CLI (ciclo 2, merge 2º)

**Depende de:** #7 (B, CLI base e token) e #2 (B, validação e SQL de gravação da Web, que entra antes da sua no ciclo 2).
**Arquivos:** CLI `Program.cs`, API `Program.cs`, `Db.cs`, `README.md`. Testes em `tests/`.

**O que fazer:**
1. **API:** `POST /api/cli/records` (criar) e `PUT /api/cli/records/{id}` (editar), protegidos por Bearer. Reaproveite a função de validação `ValidateRecord` criada por B na #2 (mesmas regras e mensagens). Erro de validação devolve 400 com `{"errors":{...}}`. 404 se o id não existir.
2. **Banco:** `CliInsertRecord` e `CliUpdateRecord`, com **SQL próprio** (não chamar os métodos `Web...`). Cada um loga a linha `db` com o `request_id`.
3. **CLI:** subcomandos `add` e `edit <id>` com `--title --platform --genre --year --rating [--notes]`. Em `edit`, informe todos os campos obrigatórios (assim não precisa de um endpoint de leitura por id). Mostra os erros de validação em texto claro.
4. **Testes:** criar válido, criar inválido, editar existente, editar inexistente, 401 sem token. Testes de CLI com `HttpMessageHandler` falso. 100% de cobertura.
5. **README:** seção "#8 Cadastro e edição pela CLI" com exemplos.

**Aceite:** comandos com os mesmos campos e validações da Web; registros persistidos e **visíveis na Web**.
**Verificação manual:** criar pela CLI, abrir a Web (listagem de C) e ver o registro. Depois do merge: tag **v0.5.0**.

## 1.4 Issue #5: Exportação CSV na Web (ciclo 3, merge 3º)

**Depende de:** #4 (C, filtros e `WebSearchRecords`, que entra primeiro no ciclo 3).
**Arquivos:** `index.html`, API, `Db.cs`, `README.md`.

**O que fazer:**
1. **API:** `GET /api/web/records/export` aceitando os **mesmos filtros** da busca (`q`, `platform`, `genre`, `year_min`, `year_max`, `rating_min`). Resposta `text/csv` com `Content-Disposition: attachment`.
2. **Banco:** `WebExportRecords(filtros, client, requestId)` com SQL próprio, **sem paginação** (todos os resultados filtrados). Sem filtros exporta tudo.
3. **Web:** botão "Exportar CSV" que usa os filtros ativos no momento. Como o endpoint exige Bearer, use `fetch` com o header, converta em blob e dispare o download.
4. **CSV:** colunas e escape conforme 2.4 (vírgula, aspas e quebra de linha).
5. **Testes:** com filtro, sem filtro, resultado > 5 itens (prova que não é só a página), escape de caracteres especiais, 401.
6. **README:** seção "#5 Exportação CSV".

**Aceite:** botão, endpoint e consulta; o CSV traz todos os resultados filtrados, não só a página; sem filtros exporta tudo.
Depois do merge: tag **v0.9.0**.

## 1.5 Issue #6: Dashboard Web (ciclo 4, merge 1º)

**Depende de:** #1 (e se beneficia dos dados de seed da #3). Você abre o ciclo 4, então B precisa da sua PR para fazer a #12.
**Arquivos:** `index.html`, API, `Db.cs`, `README.md`.

**O que fazer:**
1. **API:** `GET /api/web/dashboard` → `{"by_genre":[...],"by_platform":[...],"avg_rating_by_year":[...]}` (formato em 2.4).
2. **Banco:** `WebDashboard(client, requestId)` com 3 consultas de agregação (`GROUP BY`) e SQL próprio.
3. **Web:** 3 gráficos desenhados em Canvas ou SVG, sem biblioteca: barras por gênero, barras (ou pizza) por plataforma, linha da nota média por ano. Os valores atualizam ao recarregar a página.
4. **Testes:** dashboard com dados, dashboard com tabela vazia (listas vazias), 401.
5. **README:** seção "#6 Dashboard" explicando cada indicador e a consulta que o produz. **B vai replicar exatamente isso na CLI.**

**Aceite:** 3 gráficos com dados reais do banco via API; valores atualizam ao recarregar; README explica os indicadores.
Depois do merge: tag **v0.10.0**. Avise B imediatamente.

## 1.6 O que fazer enquanto espera (paralelismo)

| Quando | Faça |
|---|---|
| Dia 1 | Preparação (2.12) e a #1 inteira. Publique a branch cedo para B e C |
| Ciclo 1, depois do seu merge | Revise as PRs de C (#3) e B (#7) |
| Ciclo 2, antes do seu turno (B vai primeiro) | Escreva a #8 na sua branch em cima da #7. Rebaseie quando #2 entrar. Revise #2 (B) e #9 (C) |
| Ciclo 3 | Escreva a #5 enquanto C faz a #4. Revise #4 (C) e #10 (B) |
| Ciclo 4 | Comece a #6 cedo: você abre o ciclo e B depende de você. Revise #12 (B) e #11 (C) |

## 1.7 Revisões que você deve (2 por colega por ciclo)

Você aprova **todas** as 8 PRs de B e C: #3, #7, #2, #9, #4, #10, #12, #11.
**Revisões aprofundadas para o vídeo:** #2 (B) e #9 (C). Anote o que verificou (campos validados, 401, logs com mesmo `request_id`, SQL próprio na CLI).

## 1.8 Sua parte no vídeo (~6 min)

1. Mostrar #1, #8, #5, #6 e suas tags v0.1.0, v0.5.0, v0.9.0, v0.10.0.
2. Explicar a revisão de #2 (B) e de #9 (C).
3. Mostrar worktrees, branches e o histórico linear com os ciclos.
4. Mostrar os trechos do seu bloco em `Program.cs`, `Db.cs`, `index.html` e a seção do README.

## 1.9 Checklist final

- [ ] 4 issues criadas por você, com descrição, aceite, responsável, labels e milestone
- [ ] 4 PRs, cada uma com `Closes #N`, template completo e auxiliares justificados
- [ ] 2 aprovações em cada uma e Rebase and merge
- [ ] 4 tags e 4 releases no commit do merge
- [ ] 100% de cobertura em cada PR
- [ ] Revisei as 8 PRs dos colegas dentro de 4 horas
- [ ] Nenhum commit direto no `main`


---

# PARTE 2 — GUIA COMUM DA EQUIPE (igual nos 3 documentos)

## 2.1 Resumo da avaliação

| Item | Valor (equipe de 3) |
|---|---|
| Issues / PRs principais | 12 (4 por pessoa) |
| Ciclos de integração | 4 (cada pessoa integra 1 PR principal por ciclo) |
| Aprovações por PR | 2 (todos os colegas) |
| Tags e releases | 12 de cada |
| Vídeo | até 18 min (~6 min por pessoa) |
| Prazo | 9 dias corridos |

Avalia-se o **processo** Git/GitHub, não a sofisticação do código.

## 2.2 Decisões técnicas adotadas

Alterar só com acordo dos 3 e **antes** da issue #1 ser integrada.

- **Linguagem:** C# / .NET 9, Minimal API.
- **Banco:** SQLite (arquivo em volume Docker), pacote `Microsoft.Data.Sqlite`.
- **Domínio:** lista de games.
- **Execução:** tudo via Docker Compose (Web, API, banco, CLI, testes, cobertura). O professor só tem Docker no host.
- **Testes:** xUnit + `WebApplicationFactory` + coverlet. Cobertura **100% de linhas** em `Program.cs` (API), `Db.cs` e `Program.cs` (CLI) já integrados.
- **Gráficos:** desenhados à mão com Canvas/SVG dentro do `index.html`, sem biblioteca externa (a spec pede HTML, CSS e JS embutidos).

## 2.3 Arquivos de produção (os ÚNICOS permitidos)

| Papel | Caminho |
|---|---|
| Web | `src/GamesList.Api/wwwroot/index.html` |
| API | `src/GamesList.Api/Program.cs` |
| Banco | `src/GamesList.Api/Db.cs` (contém também o `Logger` estático) |
| CLI | `src/GamesList.Cli/Program.cs` |
| Documentação | `README.md` (uma seção por issue) |

**Auxiliares** (livres, mas cada um criado/alterado deve ser **listado e justificado na PR**): `*.csproj`, `GamesList.sln`, `Dockerfile`s, `docker-compose.yml`, `.env.example`, `.gitignore`, `tests/**`.

Arquivos por PR principal:
- **Web:** `index.html` + API + banco + `README.md`.
- **CLI:** CLI + API + banco + `README.md`.
- Rotas e consultas SQL da Web e da CLI são **separadas**. No `Db.cs`, métodos `Web...` e `Cli...`, cada um com seu SQL, mesmo que parecidos. É permitido compartilhar helpers de validação, autenticação e log.

### Convenção contra conflitos (obrigatória)

Os 3 mexem nos mesmos arquivos. A issue #1 cria, em `Program.cs`, `Db.cs`, `index.html` e `README.md`, **blocos delimitados por issue**:

```
// ===== #4 inicio: busca web =====
// ===== #4 fim =====
```
(`<!-- ... -->` no HTML e no README). Cada pessoa escreve **só dentro do bloco da sua issue**. Se precisar tocar código de outro, avise no grupo antes.

## 2.4 Contrato de dados (fonte única de verdade)

**Tabela `games`:** `id` (inteiro, autoincremento), `title`, `platform`, `genre`, `release_year`, `rating`, `notes`, `active` (padrão 1), `created_at`.
**Tabela `users`:** `username`, `password_hash`, `salt`. O esquema completo é criado na #1, para ninguém mexer em esquema depois.

| Campo | Regra de validação (igual na Web e na CLI) |
|---|---|
| `title` | obrigatório, 1–100 caracteres |
| `platform` | obrigatório; PC, PlayStation, Xbox, Switch, Mobile, Outro |
| `genre` | obrigatório; Ação, Aventura, RPG, Estratégia, Esporte, Corrida, Puzzle, Outro |
| `release_year` | obrigatório, inteiro de 1970 até ano atual + 1 |
| `rating` | obrigatório, número de 0 a 10 |
| `notes` | opcional, até 500 caracteres |

**Respostas:**
- Listagem e busca: `{"items":[...],"page":1,"page_size":5,"total":23}`.
- Erro de validação: HTTP 400 `{"errors":{"campo":"mensagem"}}`.
- Sem token ou token inválido: HTTP 401. Id inexistente: HTTP 404.
- Query string comum: `page`, `page_size` (padrão 5), `sort` (campo), `order` (`asc`/`desc`).
- **Filtros de busca/export** (todos opcionais e combináveis): `q` (título contém), `platform`, `genre`, `year_min`, `year_max`, `rating_min`.
- **Dashboard (3 indicadores):** `{"by_genre":[{"label","value"}],"by_platform":[{"label","value"}],"avg_rating_by_year":[{"label","value"}]}`.
- **CSV:** colunas `id,title,platform,genre,release_year,rating,notes,active`, todos os resultados filtrados (sem paginação), com escape correto de vírgula, aspas e quebra de linha.
- **Seed** (feito na #3): mínimo 25 jogos, 5+ gêneros, 4+ plataformas, anos 2000–2024.

## 2.5 Endpoints (os 12 que usamos)

| Operação | Web | CLI | Método | Issues |
|---|---|---|---|---|
| Health | `/api/web/health` | `/api/cli/health` | GET | #1 / #7 |
| Login / token | `/api/web/login` | `/api/cli/token` | POST | #1 / #7 |
| Listar | `/api/web/records` | `/api/cli/records` | GET | #3 / #9 |
| Criar | `/api/web/records` | `/api/cli/records` | POST | #2 / #8 |
| Editar | `/api/web/records/{id}` | `/api/cli/records/{id}` | PUT | #2 / #8 |
| Excluir | `/api/web/records/{id}` | `/api/cli/records/{id}` | DELETE | #3 / #9 |
| Buscar | `/api/web/records/search` | `/api/cli/records/search` | GET | #4 / #10 |
| CSV | `/api/web/records/export` | `/api/cli/records/export` | GET | #5 / #11 |
| Dashboard | `/api/web/dashboard` | `/api/cli/dashboard` | GET | #6 / #12 |

Status (PATCH) e duplicar (POST) são só de equipes de 4 e **não** entram.

## 2.6 Autenticação

- Usuário inicial vem de variáveis de ambiente `GAMESLIST_ADMIN_USER` e `GAMESLIST_ADMIN_PASSWORD` (arquivo `.env`, **não versionado**; versionar só o `.env.example` com valores fictícios).
- Senha guardada com hash PBKDF2 + salt. **Nunca** logar senha ou token.
- `POST /api/web/login` e `POST /api/cli/token` devolvem `{"token":"..."}` (32 bytes aleatórios, em memória). Enviar `Authorization: Bearer <token>`.
- A Web guarda o token em `sessionStorage`. A CLI aceita `--token` ou a variável `GAMESLIST_TOKEN`.
- Só os healthchecks e o login/token são públicos. Todo o resto responde 401 sem credencial válida.
- Contrato interno (criado na #1, reutilizado por todos): `TokenStore.Issue(client)` e `TokenStore.Validate(token)`, mais um filtro de autenticação aplicado a todas as rotas protegidas.

## 2.7 Logs

Uma linha JSON por evento no stdout, visível com `docker compose logs api`.

```
{"timestamp":"2026-11-06T22:30:00Z","level":"INFO","layer":"api","client":"cli","operation":"create","status":"success","request_id":"req-123","message":"Registro criado"}
{"timestamp":"2026-11-06T22:30:00Z","level":"INFO","layer":"db","client":"cli","operation":"insert","status":"success","request_id":"req-123","message":"Registro persistido"}
```

- Campos: `timestamp` (ISO 8601 UTC), `level` (INFO/WARN/ERROR), `layer` (api/db), `client` (web/cli), `operation`, `status` (success/error), `request_id`, `message`.
- Um middleware na API gera o `request_id` (`req-<guid>`), e **todo método do `Db.cs` recebe `(client, requestId)`** e loga a própria linha, **inclusive em leituras**.
- Registrar sucesso e falha de autenticação (sem expor segredo).
- Cada PR que cria operação nova mostra, na descrição, as duas linhas de log (api + db) com o mesmo `request_id`.

## 2.8 Comandos Docker (versão final)

```
docker compose up --build                 # Web + API + banco
docker compose logs api                   # logs JSON
docker compose run --rm tests             # testes + cobertura 100%
docker compose run --rm cli <comando>     # CLI (a partir da #7)
```

## 2.9 Mapa de issues, dependências e ordem de integração

```
#1 ─┬─ #3 ── #4 ── #5
    ├─ #2
    ├─ #6
    └─ #7 ─┬─ #8   (precisa também de #2)
           ├─ #9   (precisa também de #3)
           ├─ #10  (precisa também de #4)
           ├─ #11  (precisa também de #5)
           └─ #12  (precisa também de #6)
```

| Ciclo | Ordem de merge | 1º | 2º | 3º |
|---|---|---|---|---|
| 1 | A–C–B | A: **#1** (v0.1.0) | C: **#3** (v0.2.0) | B: **#7** (v0.3.0) |
| 2 | B–A–C | B: **#2** (v0.4.0) | A: **#8** (v0.5.0) | C: **#9** (v0.6.0) |
| 3 | C–B–A | C: **#4** (v0.7.0) | B: **#10** (v0.8.0) | A: **#5** (v0.9.0) |
| 4 | A–B–C | A: **#6** (v0.10.0) | B: **#12** (v0.11.0) | C: **#11** (v1.0.0) |

Dependências conferidas na ordem de merge:
- #8 (A, ciclo 2) precisa de #7 (ciclo 1) e de #2 (B, 1º do ciclo 2).
- #10 (B, ciclo 3) precisa de #4 (C, 1º do ciclo 3).
- #12 (B, ciclo 4) precisa de #6 (A, 1º do ciclo 4).
- #11 (C, ciclo 4) precisa de #5 (ciclo 3).

Cada pessoa fica com 4 issues: A = #1, #8, #5, #6; B = #7, #2, #10, #12; C = #3, #9, #4, #11.
Se a ordem de merge dentro de um ciclo mudar, **renumere as versões**: SemVer único e crescente na ordem real dos merges. A última release (v1.0.0) deve ser o `main` final funcionando.

## 2.10 Dá para trabalhar em paralelo?

**Sim, quase sempre.** O que é sequencial é só o **merge**.

1. **Dentro de um ciclo,** os 3 desenvolvem ao mesmo tempo, cada um na sua issue e no seu worktree. A ordem só decide quem integra primeiro. Quem vem depois dá `git fetch upstream && git rebase upstream/main` na própria branch (force push na **sua** branch de feature é normal; no `main` é proibido).
2. **O único gargalo real é a #1** (ciclo 1, A). B e C não têm código base antes dela. Por isso: A entrega a #1 no **dia 1**, publica a branch para B e C começarem em cima dela, e B e C rebaseiam depois do merge.
3. **Revisão é o segundo gargalo.** Cada PR precisa de 2 aprovações, e cada pessoa revisa 8 PRs. Regra do grupo: **revisar em até 4 horas** após ser marcado.
4. **Prepare o próximo ciclo antes de ele abrir.** Pode escrever o código da próxima issue na sua branch, mas **só abra a PR principal depois que o ciclo anterior fechar** (a spec diz que o ciclo seguinte só começa quando todos integraram). Se quiser certeza de que isso é permitido, confirme com o professor.
5. **Dependência cruzada:** se a sua issue depende de uma PR ainda não integrada, baseie sua branch na branch do colega, depois rebaseie no `main` quando ela entrar.

## 2.11 Cronograma sugerido (9 dias)

| Dia | O quê |
|---|---|
| 1 | Preparação (2.12) + A desenvolve e abre a PR da #1. B e C preparam #7 e #3 |
| 2 | Aprovações e merge **#1 → #3 → #7**; fecha o ciclo 1 |
| 3–4 | Ciclo 2: **#2 → #8 → #9** |
| 5–6 | Ciclo 3: **#4 → #10 → #5** |
| 7–8 | Ciclo 4: **#6 → #12 → #11** |
| 9 | Teste em clone limpo, correções (PRs com `Refs`), gravação do vídeo |

Folga: se um ciclo atrasar, o dia 9 é a única reserva. Não deixe o vídeo para o último dia.

## 2.12 Preparação (dia 1, sem commit no `main`)

1. Alguém cria o **repositório principal público** e adiciona os outros dois como colaboradores. Cada pessoa faz seu **fork**.
2. Em cada máquina: clone do fork, `git remote add upstream <repo principal>`, Docker e Docker Compose instalados.
3. No GitHub, criar **labels** (`web`, `cli`, `ciclo-1` … `ciclo-4`, `correção`) e **4 milestones** (Ciclo 1 a 4).
4. Cada pessoa **cria as próprias 4 issues** (descrição, critérios de aceite, responsável, labels, milestone). Use os critérios da sua Parte 1.
5. Criar a **spec** (lista das 12 issues) e o template de PR. O arquivo `docs/avaliacao-git-github/PULL_REQUEST_TEMPLATE.md` do professor deve ser copiado para `.github/PULL_REQUEST_TEMPLATE.md` (via PR da #1).
6. Ativar na configuração do repositório: **só "Rebase and merge"** (desmarcar merge commit e squash).
7. **Nenhum commit direto no `main`.** A reorganização local já feita (`src/`, `.sln`, `.gitignore`) entra pela PR da #1, listada e justificada como auxiliar.

## 2.13 Fluxo padrão de cada issue

1. Worktree novo, criado a partir de `upstream/main` atualizado:
   `git worktree add ../gameslist-issue-N -b feat/N-slug upstream/main`
2. Implementar **só nos arquivos permitidos** e **só no bloco da issue**.
3. Escrever os testes. Rodar `docker compose run --rm tests` e conferir **100% de linhas**.
4. Escrever a seção da issue no README (a #1 explica como iniciar a Web; a #7, como usar a CLI).
5. Rebase em `upstream/main`, push para o seu fork, abrir PR **para o `main` do repositório principal**, com `Closes #N` e o template preenchido (descrição, arquivos alterados, justificativa dos auxiliares, endpoints, logs, autenticação, comandos Compose, testes, cobertura, verificação funcional).
6. Marcar os 2 colegas como revisores. Aguardar as **2 aprovações** (comentários não contam; aprovação do autor não conta).
7. **Rebase and merge** (nunca merge commit nem squash).
8. Criar **tag** `vX.Y.Z` no commit do `main` resultante do merge (não na branch) e a **release** (funcionalidade, issue, PR).
9. Avisar o grupo para o próximo da fila integrar.

Correção depois do merge: PR nova **sem issue nova**, com `Refs #N`, motivo explicado, aprovação dos 2 colegas, Rebase and merge. Não conta nos ciclos e não precisa de tag.

## 2.14 Checklist de revisão (use em toda PR)

- [ ] Só tocou os arquivos permitidos e só o bloco da issue; auxiliares justificados na descrição.
- [ ] Usa `Closes #N` (ou `Refs #N` em correção) e o template está completo.
- [ ] Web e CLI usam rotas e SQL próprios; a CLI não acessa o banco.
- [ ] Rotas protegidas devolvem 401 sem token; healthcheck é público.
- [ ] Log API + DB com o mesmo `request_id`; nenhum segredo nos logs.
- [ ] Rodou `docker compose run --rm tests` localmente e a cobertura está em 100%.
- [ ] README tem a seção da issue.
- [ ] Os critérios de aceite da issue foram verificados rodando via Compose.

**Para o vídeo:** cada pessoa precisa explicar **uma PR revisada de cada colega** (o que verificou e por que aprovou). Revise essas PRs com mais cuidado e **anote o que testou**. Sugestão: A → #2 (B) e #9 (C); B → #8 (A) e #4 (C); C → #5 (A) e #12 (B).

## 2.15 Roteiro do vídeo (até 18 min, câmera ligada)

Cada pessoa (~6 min) mostra:
1. Suas 4 issues/PRs, funcionalidades integradas, correções e tags/releases.
2. A PR revisada de cada colega (2 explicações).
3. Worktrees, branches e histórico de integração (linear), incluindo a ordem dos ciclos.
4. Como as mudanças aparecem nos arquivos exigidos e no README.

Comece o vídeo com 1–2 min de execução: `docker compose up`, login, uma operação Web, uma CLI, o log correlacionado. Não é preciso mostrar comandos Git. Exceder 18 min reduz a nota coletiva.

## 2.16 Pendências em aberto

- Template oficial de PR do professor (`PULL_REQUEST_TEMPLATE.md`): não veio no arquivo da avaliação, conseguir o original.
- Confirmar com o professor se escrever código do ciclo seguinte antes dele abrir é aceito (item 2.10.4). Este plano não depende disso.
