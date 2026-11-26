// Sin `server-only`: lo usa también el seed (tsx).
import { hash, verify } from "@node-rs/argon2";

// argon2id (algorithm 2), parámetros OWASP-ish moderados para serverless.
const OPTS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;

/** Verifica contra un hash falso para igualar tiempos cuando el usuario no existe. */
export async function verifyDummy(plain: string): Promise<false> {
  dummy ??= hash("pc-dummy-password-for-timing", OPTS);
  await verifyPassword(await dummy, plain);
  return false;
}
