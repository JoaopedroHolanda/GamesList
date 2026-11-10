# GameList

Lista de jogos com **Web + CLI** sobre a mesma API REST e o mesmo banco (trabalho final de versionamento de código).

- **API:** Node.js + TypeScript (Express)
- **Banco:** PostgreSQL 16
- **Web:** `index.html` servido por nginx, que também encaminha `/api/*` para a API
- **Tudo roda pelo Docker Compose.** No host só são necessários Docker, Docker Compose, um navegador e um terminal.

## Arquivos de produção

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Toda a Web (HTML, CSS e JavaScript embutidos) |
| `api.ts` | Endpoints e lógica da API |
| `db.ts` | Acesso ao banco, hash de senha e logs |
| `cli.ts` | Toda a CLI (entra na issue #7) |
| `README.md` | Execução e documentação de cada issue |

---

## Issue #1 — Estrutura Web

### Como iniciar

```bash
docker compose up --build
```

Depois abra <http://localhost:8080>.

Para parar: `Ctrl+C` e, se quiser limpar os dados, `docker compose down -v`.

### Como fazer login

Existe um usuário inicial **configurável por variáveis de ambiente**, criado (ou atualizado) toda vez que a API inicia:

| Variável | Para que serve | Valor padrão de desenvolvimento |
|---|---|---|
| `ADMIN_USER` | Usuário inicial | `admin` |
| `ADMIN_PASSWORD` | Senha do usuário inicial | `admin123` |
| `TOKEN_SECRET` | Segredo que assina os tokens de sessão | `dev-only-secret-change-me` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Banco | `gamelist` |

Os padrões são **fictícios e só para desenvolvimento local**. Para usar outros valores, copie o modelo e edite:

```bash
cp .env.example .env   # o Compose lê o .env automaticamente
docker compose up --build
```

O `.env` não é versionado. A senha é guardada no banco apenas como hash (scrypt com salt) e nunca é escrita nos logs.

Na página inicial, informe usuário e senha. Com credenciais corretas aparece a tela de boas-vindas; com credenciais erradas, uma mensagem de erro.

### Endpoints

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| GET | `/api/web/health` | Pública | Healthcheck (HTTP 200) |
| POST | `/api/web/login` | Pública | Recebe `{"username","password"}` e devolve `{"token","user"}` |
| GET | `/api/web/me` | `Authorization: Bearer <token>` | Valida a sessão (usada pela página ao abrir) |

Sem credenciais, ou com credenciais/token inválidos, a resposta é **HTTP 401**.

Exemplos (pelo terminal):

```bash
curl -i http://localhost:8080/api/web/health

curl -s -X POST http://localhost:8080/api/web/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'

curl -i http://localhost:8080/api/web/me                # 401 (sem token)
curl -i http://localhost:8080/api/web/me \
  -H "Authorization: Bearer <token recebido no login>"   # 200
```

### Logs

Cada operação gera **uma linha JSON por evento** no stdout, nas camadas `api` e `db`, com o mesmo `request_id` na mesma requisição. Campos: `timestamp`, `level`, `layer`, `client`, `operation`, `status`, `request_id`, `message`.

Para consultar:

```bash
docker compose logs api            # todos os logs da API
docker compose logs -f api         # acompanhando em tempo real
```

Exemplo de um login (duas linhas, mesmo `request_id`):

```json
{"timestamp":"2026-11-09T23:10:00.000Z","level":"INFO","layer":"db","client":"web","operation":"find_user","status":"success","request_id":"7c1f...","message":"Consulta de usuário concluída"}
{"timestamp":"2026-11-09T23:10:00.040Z","level":"INFO","layer":"api","client":"web","operation":"login","status":"success","request_id":"7c1f...","message":"Login realizado com sucesso"}
```

Falhas de autenticação aparecem como `WARN` com `status: "error"`, sem expor senhas nem tokens.

### Testes e cobertura

Os testes unitários (API e banco) e a medição de cobertura rodam em contêiner:

```bash
docker compose run --rm test                         # testes + cobertura de linhas (exige 100%)
docker compose run --rm test npm run typecheck       # verificação de tipos
```

A cobertura obrigatória é de **100% das linhas** de `api.ts` e `db.ts` (e `cli.ts` quando existir). O comando falha se ficar abaixo disso.

### Arquivos auxiliares (infra e testes)

`package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `Dockerfile`, `docker-compose.yml`, `nginx.conf`, `.dockerignore`, `.gitignore`, `.env.example` e `tests/`. Cada um é justificado na descrição da PR.
