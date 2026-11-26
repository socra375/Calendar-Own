// E2E del flujo "olvidé mi contraseña" contra `pnpm dev` (BD dev con seed). Uso: node tests/e2e/password-reset.mjs
// - Arranca `pnpm dev` si BASE no responde y lo detiene al terminar.
// - El correo no se intercepta: el token se acuña directamente en la BD dev (solo guarda el sha256, igual que el servicio).
// - Al terminar restaura la contraseña original del propietario con `pnpm auth:reset-password`.
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { BASE, EMAIL, PASSWORD, check, failed, launch, resetRateLimits } from "./helpers.mjs";

const DB = process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/calendar";
const NEW_PASSWORD = "E2e-nueva-contraseña-98765";
const OUT = new URL("../../docs/screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

async function up() {
  try {
    return (await fetch(`${BASE}/login`)).ok;
  } catch {
    return false;
  }
}
let server;
if (!(await up())) {
  server = spawn("pnpm", ["dev"], { stdio: "ignore", detached: true });
  for (let i = 0; i < 90 && !(await up()); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!(await up())) {
    console.error("pnpm dev no arrancó");
    process.exit(1);
  }
}

function mintToken() {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  execFileSync(
    "psql",
    [DB, "-q", "-v", `email=${EMAIL}`, "-v", `hash=${hash}`, "-f", "-"],
    {
      input: `insert into password_reset_tokens (user_id, token_hash, expires_at)
              select id, :'hash', now() + interval '1 hour' from users where lower(email) = lower(:'email');`,
    },
  );
  return token;
}

function restorePassword() {
  execFileSync("pnpm", ["-s", "auth:reset-password", EMAIL], {
    env: { ...process.env, DATABASE_URL: DB, NEW_PASSWORD: PASSWORD },
    stdio: "ignore",
  });
}

try {
  resetRateLimits();
  const { browser, ctx, page, errors } = await launch({ width: 1280, height: 800 });

  // ── login → enlace → solicitar
  await page.goto(`${BASE}/login`);
  await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
  await page.waitForURL("**/forgot-password");
  check("enlace 'olvidé' lleva a /forgot-password sin sesión", page.url().endsWith("/forgot-password"));
  await page.getByLabel("Correo").fill(EMAIL);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await page.getByText("Si el correo existe, recibirás un enlace").waitFor();
  check("mensaje genérico de confirmación", true);
  const ghost = await ctx.newPage();
  await ghost.goto(`${BASE}/forgot-password`);
  await ghost.getByLabel("Correo").fill("no-existe@example.com");
  await ghost.getByRole("button", { name: "Enviar enlace" }).click();
  await ghost.getByText("Si el correo existe, recibirás un enlace").waitFor();
  check("correo inexistente: mismo mensaje", true);
  await ghost.close();

  // ── /reset-password sin token / con token inválido
  await page.goto(`${BASE}/reset-password`);
  await page.getByRole("link", { name: "Solicitar un enlace nuevo" }).waitFor();
  check("sin token: estado de error con enlace a pedir uno nuevo", true);
  await page.goto(`${BASE}/reset-password?token=${"A".repeat(43)}`);
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Confirmar contraseña").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await page.getByText("El enlace no es válido o ha caducado").waitFor();
  check("token inválido: error genérico", true);

  // ── token válido
  const token = mintToken();
  await page.goto(`${BASE}/reset-password?token=${token}`);
  await page.getByLabel("Nueva contraseña", { exact: true }).waitFor();
  check("el token se quita de la URL", !page.url().includes("token"), page.url());
  await page.getByLabel("Nueva contraseña", { exact: true }).fill("corta");
  await page.getByLabel("Confirmar contraseña").fill("corta");
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  check("contraseña corta rechazada en cliente", await page.getByRole("alert").getByText("al menos 12").isVisible());
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Confirmar contraseña").fill(NEW_PASSWORD + "x");
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  check("confirmación distinta rechazada", await page.getByText("no coinciden").isVisible());
  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  check("mostrar/ocultar cambia el tipo", (await page.getByLabel("Nueva contraseña", { exact: true }).getAttribute("type")) === "text");
  await page.getByLabel("Confirmar contraseña").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await page.waitForURL("**/login?reset=1");
  await page.getByText("Contraseña actualizada. Inicia sesión").waitFor();
  check("redirige a /login con aviso de éxito", true);

  // ── login con la nueva (y la vieja ya no)
  await page.getByLabel("Correo").fill(EMAIL);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("Credenciales inválidas").waitFor();
  check("la contraseña vieja se rechaza", true);
  await page.getByLabel("Contraseña", { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
  check("login con la contraseña nueva", true);
  // Los 400/401 de red provocados a propósito (token inválido, contraseña vieja) salen como "Failed to load resource".
  const unexpected = errors.filter((e) => !e.includes("Failed to load resource"));
  check("sin errores de consola inesperados", unexpected.length === 0, unexpected.join(" | "));
  await browser.close();

  // ── capturas dark/light × 1280/390 (token sin consumir: solo se lee la página)
  resetRateLimits();
  const shotToken = mintToken();
  for (const theme of ["dark", "light"]) {
    for (const [w, h] of [[1280, 800], [390, 844]]) {
      const s = await launch({ width: w, height: h }, theme);
      await s.ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await s.page.goto(`${BASE}/forgot-password`);
      await s.page.getByLabel("Correo").fill(EMAIL);
      await s.page.screenshot({ path: `${OUT}forgot-password-${theme}-${w}.png` });
      await s.page.goto(`${BASE}/reset-password?token=${shotToken}`);
      await s.page.getByLabel("Nueva contraseña", { exact: true }).fill("una-contraseña-larga");
      await s.page.getByLabel("Confirmar contraseña").fill("una-contraseña-larga");
      await s.page.screenshot({ path: `${OUT}reset-password-${theme}-${w}.png` });
      const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      check(`sin scroll horizontal ${theme} ${w}`, !overflow);
      await s.browser.close();
    }
  }
} finally {
  try {
    restorePassword();
    console.log("Contraseña del propietario restaurada.");
  } catch (e) {
    console.error("NO se pudo restaurar la contraseña del propietario:", e.message);
  }
  if (server) {
    try {
      process.kill(-server.pid);
    } catch {}
    try {
      execFileSync("pkill", ["-f", "next/dist/bin/next dev"]);
    } catch {}
  }
  resetRateLimits();
}
console.log(failed() ? `${failed()} comprobaciones FALLARON` : "E2E password-reset OK");
process.exit(failed() ? 1 : 0);
