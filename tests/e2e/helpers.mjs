// Utilidades compartidas por los scripts E2E (Playwright). Uso: node tests/e2e/<script>.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export const { chromium } = require("playwright");

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const EMAIL = process.env.E2E_EMAIL ?? "owner@example.com";
export const PASSWORD = process.env.E2E_PASSWORD ?? "ChangeMe-12345";

export async function launch(viewport = { width: 1280, height: 800 }, colorScheme = "dark") {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme, locale: "es-ES" });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("pc:calview", localStorage.getItem("pc:calview") ?? "");
    } catch {}
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return { browser, ctx, page, errors };
}

export async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Correo").fill(EMAIL);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

export async function setTheme(page, theme) {
  await page.evaluate((t) => localStorage.setItem("theme", t), theme);
  await page.reload();
}

let failures = 0;
export function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`);
  if (!ok) failures++;
}
export const failed = () => failures;

/** El rate limit general (120 req/min) es por usuario: el E2E genera ráfagas, así que se vacía la tabla entre fases. */
import { execFileSync } from "node:child_process";
export function resetRateLimits() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/calendar";
  try {
    execFileSync("psql", [url, "-qc", "delete from rate_limits"], { stdio: "ignore" });
  } catch {
    /* sin psql: se continúa */
  }
}
