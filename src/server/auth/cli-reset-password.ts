// Plan B de recuperación: restablece la contraseña de una cuenta desde la terminal (sin correo).
//   DATABASE_URL=... pnpm auth:reset-password <email>            (pide la contraseña sin eco)
//   DATABASE_URL=... NEW_PASSWORD=... pnpm auth:reset-password <email>
//   echo 'nueva-contraseña-larga' | pnpm auth:reset-password <email>
// Sin `server-only`: se ejecuta con tsx. Usa la misma política y argon2id que el flujo web.
import { config } from "dotenv";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { newPasswordSchema } from "../../lib/validation/auth";
import { createDb } from "../db/create";
import { auditLogs, passwordResetTokens, sessions, users } from "../db/schema";
import { safeErrorLog } from "../safe-log";
import { hashPassword } from "./password";

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

/** Lee una línea. En TTY no hace eco (stdout mudo mientras se escribe). */
async function readLine(prompt: string): Promise<string> {
  const tty = Boolean(process.stdin.isTTY);
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stderr.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: tty });
  return new Promise((resolve) => {
    let done = false;
    rl.once("close", () => {
      if (!done) resolve(""); // EOF sin respuesta
    });
    rl.question(tty ? prompt : "", (answer) => {
      done = true;
      resolve(answer);
      rl.close();
      if (tty) process.stderr.write("\n");
    });
    muted = tty; // tras pintar el prompt, lo tecleado no se muestra
  });
}

async function main() {
  config({ path: ".env.local" });
  config();
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) fail("Uso: pnpm auth:reset-password <email>   (opcional: NEW_PASSWORD=...)");
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL no está definida");

  let password = process.env.NEW_PASSWORD;
  if (!password) {
    password = await readLine("Nueva contraseña: ");
    if (process.stdin.isTTY) {
      const again = await readLine("Repite la contraseña: ");
      if (again !== password) fail("Las contraseñas no coinciden. No se hizo ningún cambio.");
    }
  }
  const policy = newPasswordSchema.safeParse(password);
  if (!policy.success) fail(`Contraseña rechazada: ${policy.error.issues[0]!.message}`);

  const { db, pool } = createDb(url!, { max: 1 });
  try {
    const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    if (!user) fail(`No existe ninguna cuenta con el correo ${email}`);
    const passwordHash = await hashPassword(password);
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user!.id));
      await tx.delete(sessions).where(eq(sessions.userId, user!.id)); // equivale a destroyAllSessions
      await tx
        .update(passwordResetTokens)
        .set({ expiresAt: now })
        .where(and(eq(passwordResetTokens.userId, user!.id), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, now)));
      await tx.insert(auditLogs).values({
        userId: user!.id,
        actorType: "system",
        action: "auth.password_reset_completed",
        resourceType: "user",
        resourceId: user!.id,
        result: "success",
        changes: { via: "cli" },
      });
    });
    console.log(`Contraseña actualizada para ${user!.email}. Todas sus sesiones fueron cerradas.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  safeErrorLog(e, "[auth:reset-password]");
  process.exit(1);
});
