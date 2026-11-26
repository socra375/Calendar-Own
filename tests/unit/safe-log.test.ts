import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError, safeErrorLog } from "@/server/safe-log";

// Forma de los errores de Drizzle: message con "Failed query: <sql>\nparams: <valores>" y `cause` de pg.
function drizzleLikeError() {
  const cause = Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), {
    code: "23505",
    detail: "Key (email)=(secret@example.com) already exists.",
  });
  return Object.assign(
    new Error('Failed query: insert into "users" ("email", "password_hash") values ($1, $2)\nparams: secret@example.com,$argon2id$v=19$SECRETHASH', { cause }),
    { name: "DrizzleQueryError", params: ["secret@example.com", "$argon2id$v=19$SECRETHASH"], query: "insert …" },
  );
}

describe("safeErrorLog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("no imprime los params de la consulta ni el objeto crudo", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    safeErrorLog(drizzleLikeError(), "[api] error");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]).toHaveLength(1); // un solo string, sin objetos
    const out = String(spy.mock.calls[0]![0]);
    expect(out).toContain("[api] error");
    expect(out).toContain("DrizzleQueryError");
    expect(out).toContain("23505");
    expect(out).toContain("Failed query");
    for (const secret of ["secret@example.com", "SECRETHASH", "argon2id", "params:"]) expect(out).not.toContain(secret);
  });

  it("trunca mensajes largos y los deja en una sola línea", () => {
    const d = describeError(new Error("x".repeat(5000) + "\nsegunda línea"));
    expect(d.length).toBeLessThan(400);
    expect(d).not.toContain("\n");
  });

  it("usa el code de la causa (pg) si el error no lo trae", () => {
    expect(describeError(Object.assign(new Error("boom"), { cause: { code: "57P01" } }))).toBe("Error [code=57P01]: boom");
  });

  it("tolera valores que no son Error", () => {
    expect(describeError("texto")).toBe("string: texto");
    expect(describeError(undefined)).toBe("undefined");
    expect(describeError({ password: "hunter2" })).toBe("object");
  });
});
