import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Config,
  type StartDeps,
  createApp,
  loadConfig,
  signToken,
  start,
  verifyToken,
} from "../api.js";
import { type Queryable, hashPassword } from "../db.js";

const config: Config = {
  port: 0,
  databaseUrl: "postgres://u:p@db:5432/x",
  adminUser: "admin",
  adminPassword: "senha-forte",
  tokenSecret: "segredo-de-teste",
  tokenTtlSeconds: 60,
};

let output: string[] = [];
let servers: Server[] = [];

beforeEach(() => {
  output = [];
  servers = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
});

function logs(): Record<string, string>[] {
  return output
    .join("")
    .split("\n")
    .filter((line) => line.startsWith('{"timestamp"'))
    .map((line) => JSON.parse(line));
}

function dbWithUser(): Queryable {
  const row = { id: 1, username: "admin", password_hash: hashPassword("senha-forte") };
  return { query: vi.fn(async () => ({ rows: [row] })) };
}

async function listen(db: Queryable): Promise<string> {
  const server = createApp(db, config).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("GET /api/web/health", () => {
  it("responde 200 sem autenticação e sem acessar o banco", async () => {
    const db = dbWithUser();
    const base = await listen(db);
    const response = await fetch(`${base}/api/web/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(db.query).not.toHaveBeenCalled();
    expect(logs()[0]).toMatchObject({ layer: "api", client: "web", operation: "health", status: "success" });
  });
});

describe("POST /api/web/login", () => {
  it("autentica o usuário inicial e devolve um token válido", async () => {
    const base = await listen(dbWithUser());
    const response = await postJson(`${base}/api/web/login`, { username: "admin", password: "senha-forte" });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { token: string; user: string };
    expect(data.user).toBe("admin");
    expect(verifyToken(data.token, config.tokenSecret)).toBe("admin");
  });

  it("gera logs correlacionados (api + db) sem expor segredos", async () => {
    const base = await listen(dbWithUser());
    const response = await postJson(
      `${base}/api/web/login`,
      { username: "admin", password: "senha-forte" },
      { "X-Request-Id": "req-123" },
    );
    const data = (await response.json()) as { token: string };
    const entries = logs();
    const api = entries.find((e) => e.layer === "api" && e.operation === "login");
    const db = entries.find((e) => e.layer === "db" && e.operation === "find_user");
    expect(api).toMatchObject({ level: "INFO", client: "web", status: "success", request_id: "req-123" });
    expect(db).toMatchObject({ level: "INFO", client: "web", status: "success", request_id: "req-123" });
    expect(response.headers.get("x-request-id")).toBe("req-123");
    const everything = output.join("");
    expect(everything).not.toContain("senha-forte");
    expect(everything).not.toContain(data.token);
  });

  it("responde 401 para senha incorreta e registra WARN", async () => {
    const base = await listen(dbWithUser());
    const response = await postJson(`${base}/api/web/login`, { username: "admin", password: "errada" });
    expect(response.status).toBe(401);
    expect(logs().find((e) => e.layer === "api")).toMatchObject({
      level: "WARN",
      status: "error",
      operation: "login",
    });
    expect(output.join("")).not.toContain("errada");
  });

  it("responde 401 para usuário inexistente", async () => {
    const db: Queryable = { query: vi.fn(async () => ({ rows: [] })) };
    const base = await listen(db);
    const response = await postJson(`${base}/api/web/login`, { username: "ninguem", password: "x" });
    expect(response.status).toBe(401);
  });

  it.each([{}, { username: "admin" }, { password: "x" }, { username: "", password: "" }, { username: 1, password: 2 }])(
    "responde 401 quando as credenciais estão ausentes ou inválidas: %j",
    async (body) => {
      const db = dbWithUser();
      const base = await listen(db);
      const response = await postJson(`${base}/api/web/login`, body);
      expect(response.status).toBe(401);
      expect(db.query).not.toHaveBeenCalled();
    },
  );

  it("responde 401 quando a requisição não tem corpo", async () => {
    const base = await listen(dbWithUser());
    const response = await fetch(`${base}/api/web/login`, { method: "POST" });
    expect(response.status).toBe(401);
  });

  it("responde 500 e registra ERROR quando o banco falha", async () => {
    const db: Queryable = {
      query: vi.fn(async () => {
        throw new Error("banco fora do ar");
      }),
    };
    const base = await listen(db);
    const response = await postJson(`${base}/api/web/login`, { username: "admin", password: "x" });
    expect(response.status).toBe(500);
    expect(logs().filter((e) => e.level === "ERROR").map((e) => e.layer)).toEqual(["db", "api"]);
  });

  it("responde 400 para JSON malformado, sem vazar detalhes", async () => {
    const base = await listen(dbWithUser());
    const response = await postJson(`${base}/api/web/login`, "{ quebrado");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Requisição inválida" });
  });
});

describe("GET /api/web/me (rota protegida)", () => {
  it("responde 401 sem token", async () => {
    const base = await listen(dbWithUser());
    expect((await fetch(`${base}/api/web/me`)).status).toBe(401);
  });

  it("responde 401 com token inválido ou esquema errado", async () => {
    const base = await listen(dbWithUser());
    const bad = await fetch(`${base}/api/web/me`, { headers: { Authorization: "Bearer lixo" } });
    const basic = await fetch(`${base}/api/web/me`, { headers: { Authorization: "Basic abc" } });
    expect(bad.status).toBe(401);
    expect(basic.status).toBe(401);
  });

  it("responde 200 com token válido", async () => {
    const base = await listen(dbWithUser());
    const token = signToken("admin", config.tokenSecret, 60);
    const response = await fetch(`${base}/api/web/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: "admin" });
  });
});

describe("request_id", () => {
  it("gera um novo id quando o cabeçalho é ausente ou suspeito", async () => {
    const base = await listen(dbWithUser());
    const generated = await fetch(`${base}/api/web/health`);
    const suspicious = await fetch(`${base}/api/web/health`, { headers: { "X-Request-Id": "a b;c" } });
    expect(generated.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(suspicious.headers.get("x-request-id")).not.toBe("a b;c");
  });
});

describe("tokens", () => {
  it("aceita o token válido e rejeita adulterado, de outro segredo, expirado ou malformado", () => {
    const now = 1_700_000_000_000;
    const token = signToken("admin", "s1", 60, now);
    expect(verifyToken(token, "s1", now)).toBe("admin");
    expect(verifyToken(token, "outro", now)).toBeNull();
    expect(verifyToken(token, "s1", now + 61_000)).toBeNull();
    const [payload] = token.split(".");
    expect(verifyToken(`${payload}.assinatura-falsa`, "s1", now)).toBeNull();
    expect(verifyToken(`${payload}.`, "s1", now)).toBeNull();
    expect(verifyToken("", "s1", now)).toBeNull();
  });
});

describe("loadConfig", () => {
  const env = {
    DATABASE_URL: "postgres://x",
    ADMIN_USER: "admin",
    ADMIN_PASSWORD: "p",
    TOKEN_SECRET: "s",
  };

  it("lê as variáveis e aplica padrões de porta e validade do token", () => {
    expect(loadConfig(env)).toEqual({
      port: 3000,
      databaseUrl: "postgres://x",
      adminUser: "admin",
      adminPassword: "p",
      tokenSecret: "s",
      tokenTtlSeconds: 3600,
    });
    expect(loadConfig({ ...env, PORT: "4000", TOKEN_TTL_SECONDS: "10" })).toMatchObject({
      port: 4000,
      tokenTtlSeconds: 10,
    });
  });

  it("falha listando as variáveis ausentes", () => {
    expect(() => loadConfig({ ADMIN_USER: "admin" })).toThrow(
      "Variáveis de ambiente ausentes: DATABASE_URL, ADMIN_PASSWORD, TOKEN_SECRET",
    );
  });
});

describe("start", () => {
  it("prepara o banco, cria o usuário inicial e sobe o servidor", async () => {
    const pool: Queryable = { query: vi.fn(async () => ({ rows: [] })) };
    const deps: StartDeps = {
      createPool: vi.fn(() => pool as never),
      initDb: vi.fn(async () => undefined),
      seedAdmin: vi.fn(async () => undefined),
    };
    const server = await start(
      { DATABASE_URL: "postgres://x", ADMIN_USER: "admin", ADMIN_PASSWORD: "p", TOKEN_SECRET: "s", PORT: "0" },
      deps,
    );
    servers.push(server);
    expect(deps.createPool).toHaveBeenCalledWith("postgres://x");
    expect(deps.initDb).toHaveBeenCalledWith(pool, { requestId: "startup", client: "web" });
    expect(deps.seedAdmin).toHaveBeenCalledWith(pool, { requestId: "startup", client: "web" }, "admin", "p");
    expect(server.listening).toBe(true);
    expect(logs().some((e) => e.operation === "startup" && e.status === "success")).toBe(true);
  });
});
