import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import {
  type Ctx,
  type Level,
  type Queryable,
  createPool,
  findUser,
  initDb,
  log,
  seedAdmin,
  verifyPassword,
} from "./db.js";

// ---------------------------------------------------------------------------
// Configuração (tudo por variáveis de ambiente; nada de segredo no código)
// ---------------------------------------------------------------------------

export interface Config {
  port: number;
  databaseUrl: string;
  adminUser: string;
  adminPassword: string;
  tokenSecret: string;
  tokenTtlSeconds: number;
}

const REQUIRED_ENV = ["DATABASE_URL", "ADMIN_USER", "ADMIN_PASSWORD", "TOKEN_SECRET"] as const;

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(", ")}`);
  }
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL as string,
    adminUser: env.ADMIN_USER as string,
    adminPassword: env.ADMIN_PASSWORD as string,
    tokenSecret: env.TOKEN_SECRET as string,
    tokenTtlSeconds: Number(env.TOKEN_TTL_SECONDS ?? 3600),
  };
}

// ---------------------------------------------------------------------------
// Token de sessão assinado (HMAC-SHA256, sem dependências extras)
// ---------------------------------------------------------------------------

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function signToken(user: string, secret: string, ttlSeconds: number, now = Date.now()): string {
  const body = { sub: user, exp: Math.floor(now / 1000) + ttlSeconds };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(payload, secret).toString("base64url")}`;
}

/** Devolve o usuário do token, ou null se o token for inválido ou estiver expirado. */
export function verifyToken(token: string, secret: string, now = Date.now()): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload, secret);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const body = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub: string; exp: number };
  if (body.exp * 1000 < now) return null;
  return body.sub;
}

// ---------------------------------------------------------------------------
// Aplicação HTTP
// ---------------------------------------------------------------------------

function apiLog(res: Response, level: Level, operation: string, message: string): void {
  log({
    level,
    layer: "api",
    client: "web",
    operation,
    status: level === "INFO" ? "success" : "error",
    request_id: res.locals.requestId as string,
    message,
  });
}

export function createApp(db: Queryable, config: Config): express.Express {
  const app = express();
  app.disable("x-powered-by");

  // Cada requisição recebe um request_id, repassado às camadas api e db.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header("x-request-id");
    res.locals.requestId = incoming && /^[\w.-]{1,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader("X-Request-Id", res.locals.requestId as string);
    next();
  });

  app.use(express.json());

  const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const user = verifyToken(token, config.tokenSecret);
    if (!user) {
      apiLog(res, "WARN", "auth", "Token ausente ou inválido");
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    res.locals.user = user;
    next();
  };

  // Healthcheck público: não acessa o banco.
  app.get("/api/web/health", (_req: Request, res: Response) => {
    apiLog(res, "INFO", "health", "Healthcheck respondido");
    res.status(200).json({ status: "ok" });
  });

  app.post("/api/web/login", async (req: Request, res: Response) => {
    const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };
    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
      apiLog(res, "WARN", "login", "Falha de autenticação: credenciais ausentes");
      res.status(401).json({ error: "Credenciais inválidas" });
      return;
    }
    const ctx: Ctx = { requestId: res.locals.requestId as string, client: "web" };
    try {
      const user = await findUser(db, ctx, username);
      if (!user || !verifyPassword(password, user.password_hash)) {
        apiLog(res, "WARN", "login", "Falha de autenticação: credenciais inválidas");
        res.status(401).json({ error: "Credenciais inválidas" });
        return;
      }
      const token = signToken(user.username, config.tokenSecret, config.tokenTtlSeconds);
      apiLog(res, "INFO", "login", "Login realizado com sucesso");
      res.status(200).json({ token, user: user.username });
    } catch {
      apiLog(res, "ERROR", "login", "Erro interno ao autenticar");
      res.status(500).json({ error: "Erro interno" });
    }
  });

  // Rota protegida: a página inicial usa para validar a sessão ao abrir.
  app.get("/api/web/me", requireAuth, (_req: Request, res: Response) => {
    apiLog(res, "INFO", "me", "Sessão validada");
    res.status(200).json({ user: res.locals.user });
  });

  // Erros inesperados (ex.: JSON malformado) viram respostas JSON, sem vazar detalhes.
  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status ?? 500;
    apiLog(res, status < 500 ? "WARN" : "ERROR", "request", `Requisição rejeitada (HTTP ${status})`);
    res.status(status).json({ error: status < 500 ? "Requisição inválida" : "Erro interno" });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------

export interface StartDeps {
  createPool: typeof createPool;
  initDb: typeof initDb;
  seedAdmin: typeof seedAdmin;
}

const defaultDeps: StartDeps = { createPool, initDb, seedAdmin };

export async function start(env: NodeJS.ProcessEnv, deps: StartDeps = defaultDeps): Promise<Server> {
  const config = loadConfig(env);
  const ctx: Ctx = { requestId: "startup", client: "web" };
  const pool = deps.createPool(config.databaseUrl);
  await deps.initDb(pool, ctx);
  await deps.seedAdmin(pool, ctx, config.adminUser, config.adminPassword);
  const app = createApp(pool, config);
  return new Promise((resolve) => {
    const server = app.listen(config.port, () => {
      log({
        level: "INFO",
        layer: "api",
        client: "web",
        operation: "startup",
        status: "success",
        request_id: ctx.requestId,
        message: "API iniciada",
      });
      resolve(server);
    });
  });
}

// Só sobe o servidor quando executado diretamente (`npm start`), não ao importar nos testes.
if (process.argv[1] === fileURLToPath(import.meta.url)) void start(process.env);
