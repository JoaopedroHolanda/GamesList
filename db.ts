import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import pg from "pg";

// ---------------------------------------------------------------------------
// Logs (uma linha JSON por evento no stdout)
// ---------------------------------------------------------------------------

export type Level = "INFO" | "WARN" | "ERROR";
export type Layer = "api" | "db";
export type ClientKind = "web" | "cli";

export interface LogEvent {
  level: Level;
  layer: Layer;
  client: ClientKind;
  operation: string;
  status: "success" | "error";
  request_id: string;
  message: string;
}

/** Escreve um evento de log como uma linha JSON. Nunca recebe segredos. */
export function log(event: LogEvent): void {
  const line = {
    timestamp: new Date().toISOString(),
    level: event.level,
    layer: event.layer,
    client: event.client,
    operation: event.operation,
    status: event.status,
    request_id: event.request_id,
    message: event.message,
  };
  process.stdout.write(JSON.stringify(line) + "\n");
}

// ---------------------------------------------------------------------------
// Senhas (scrypt com salt aleatório; nada em texto puro)
// ---------------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash ?? "", "hex");
  if (!salt || expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// Acesso ao banco
// ---------------------------------------------------------------------------

/** O mínimo que precisamos de um pool: facilita os testes unitários. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** Contexto de uma requisição, usado para correlacionar os logs. */
export interface Ctx {
  requestId: string;
  client: ClientKind;
}

export interface User {
  id: number;
  username: string;
  password_hash: string;
}

function dbLog(ctx: Ctx, operation: string, status: "success" | "error", message: string): void {
  log({
    level: status === "success" ? "INFO" : "ERROR",
    layer: "db",
    client: ctx.client,
    operation,
    status,
    request_id: ctx.requestId,
    message,
  });
}

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString });
}

/** Executa a consulta registrando o resultado na camada `db`. */
async function run(
  db: Queryable,
  ctx: Ctx,
  operation: string,
  okMessage: string,
  text: string,
  values?: unknown[],
): Promise<unknown[]> {
  try {
    const result = await db.query(text, values);
    dbLog(ctx, operation, "success", okMessage);
    return result.rows;
  } catch (error) {
    dbLog(ctx, operation, "error", `Falha na operação ${operation}`);
    throw error;
  }
}

export async function initDb(db: Queryable, ctx: Ctx): Promise<void> {
  await run(
    db,
    ctx,
    "init_schema",
    "Tabela users pronta",
    `CREATE TABLE IF NOT EXISTS users (
       id SERIAL PRIMARY KEY,
       username TEXT NOT NULL UNIQUE,
       password_hash TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
}

/** Cria (ou atualiza a senha de) o usuário inicial configurado por ambiente. */
export async function seedAdmin(
  db: Queryable,
  ctx: Ctx,
  username: string,
  password: string,
): Promise<void> {
  await run(
    db,
    ctx,
    "seed_user",
    "Usuário inicial persistido",
    `INSERT INTO users (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username, hashPassword(password)],
  );
}

export async function findUser(db: Queryable, ctx: Ctx, username: string): Promise<User | null> {
  const rows = await run(
    db,
    ctx,
    "find_user",
    "Consulta de usuário concluída",
    "SELECT id, username, password_hash FROM users WHERE username = $1",
    [username],
  );
  return (rows[0] as User | undefined) ?? null;
}
