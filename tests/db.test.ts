import pg from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Ctx,
  type Queryable,
  createPool,
  findUser,
  hashPassword,
  initDb,
  log,
  seedAdmin,
  verifyPassword,
} from "../db.js";

const ctx: Ctx = { requestId: "req-123", client: "web" };

let output: string[] = [];

beforeEach(() => {
  output = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function logs(): Record<string, string>[] {
  return output
    .join("")
    .split("\n")
    .filter((line) => line.startsWith('{"timestamp"'))
    .map((line) => JSON.parse(line));
}

function fakeDb(rows: unknown[] = []): Queryable & { query: ReturnType<typeof vi.fn> } {
  return { query: vi.fn(async () => ({ rows })) };
}

function failingDb(): Queryable {
  return {
    query: vi.fn(async () => {
      throw new Error("conexão recusada");
    }),
  };
}

describe("log", () => {
  it("escreve uma linha JSON com todos os campos obrigatórios", () => {
    log({
      level: "INFO",
      layer: "db",
      client: "cli",
      operation: "insert",
      status: "success",
      request_id: "req-1",
      message: "ok",
    });
    expect(output).toHaveLength(1);
    expect(output[0]!.endsWith("\n")).toBe(true);
    const entry = logs()[0]!;
    expect(Object.keys(entry)).toEqual([
      "timestamp",
      "level",
      "layer",
      "client",
      "operation",
      "status",
      "request_id",
      "message",
    ]);
    expect(new Date(entry.timestamp!).toISOString()).toBe(entry.timestamp);
    expect(entry).toMatchObject({ level: "INFO", layer: "db", client: "cli", request_id: "req-1" });
  });
});

describe("hashPassword / verifyPassword", () => {
  it("não guarda a senha em texto puro e gera salts diferentes", () => {
    const a = hashPassword("segredo");
    const b = hashPassword("segredo");
    expect(a).not.toContain("segredo");
    expect(a).not.toBe(b);
  });

  it("aceita a senha correta e rejeita a errada", () => {
    const stored = hashPassword("segredo");
    expect(verifyPassword("segredo", stored)).toBe(true);
    expect(verifyPassword("outra", stored)).toBe(false);
  });

  it.each(["", "sem-separador", "salt:", "salt:zz"])("rejeita hash malformado %j", (stored) => {
    expect(verifyPassword("segredo", stored)).toBe(false);
  });
});

describe("createPool", () => {
  it("cria um pool do pg sem conectar", async () => {
    const pool = createPool("postgres://u:p@localhost:5432/x");
    expect(pool).toBeInstanceOf(pg.Pool);
    await pool.end();
  });
});

describe("initDb", () => {
  it("cria a tabela users e registra o log da camada db", async () => {
    const db = fakeDb();
    await initDb(db, ctx);
    expect(db.query.mock.calls[0]![0]).toContain("CREATE TABLE IF NOT EXISTS users");
    expect(logs()).toEqual([
      expect.objectContaining({
        layer: "db",
        level: "INFO",
        status: "success",
        operation: "init_schema",
        request_id: "req-123",
      }),
    ]);
  });

  it("registra erro e propaga a falha", async () => {
    await expect(initDb(failingDb(), ctx)).rejects.toThrow("conexão recusada");
    expect(logs()[0]).toMatchObject({ level: "ERROR", status: "error", operation: "init_schema" });
  });
});

describe("seedAdmin", () => {
  it("persiste o usuário com a senha em hash", async () => {
    const db = fakeDb();
    await seedAdmin(db, ctx, "admin", "senha-forte");
    const [sql, values] = db.query.mock.calls[0] as [string, string[]];
    expect(sql).toContain("INSERT INTO users");
    expect(values[0]).toBe("admin");
    expect(values[1]).not.toBe("senha-forte");
    expect(verifyPassword("senha-forte", values[1]!)).toBe(true);
    expect(logs()[0]).toMatchObject({ operation: "seed_user", status: "success", request_id: "req-123" });
    expect(output.join("")).not.toContain("senha-forte");
  });

  it("propaga erro do banco", async () => {
    await expect(seedAdmin(failingDb(), ctx, "admin", "x")).rejects.toThrow("conexão recusada");
    expect(logs()[0]).toMatchObject({ level: "ERROR", operation: "seed_user" });
  });
});

describe("findUser", () => {
  it("retorna o usuário encontrado", async () => {
    const row = { id: 1, username: "admin", password_hash: "salt:hash" };
    const db = fakeDb([row]);
    await expect(findUser(db, ctx, "admin")).resolves.toEqual(row);
    expect(db.query.mock.calls[0]![1]).toEqual(["admin"]);
    expect(logs()[0]).toMatchObject({ operation: "find_user", status: "success" });
  });

  it("retorna null quando não existe", async () => {
    await expect(findUser(fakeDb([]), ctx, "ninguem")).resolves.toBeNull();
  });

  it("propaga erro do banco e registra ERROR", async () => {
    await expect(findUser(failingDb(), ctx, "admin")).rejects.toThrow("conexão recusada");
    expect(logs()[0]).toMatchObject({ level: "ERROR", status: "error", operation: "find_user" });
  });
});
