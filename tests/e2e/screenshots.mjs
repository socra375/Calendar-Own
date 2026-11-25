// Captura de pantallas (dark/light × 1280/390) con datos de demostración temporales. Uso: node tests/e2e/screenshots.mjs
import { mkdirSync } from "node:fs";
import { BASE, launch, login, resetRateLimits } from "./helpers.mjs";

const OUT = new URL("../../docs/screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const TZ = "America/Santo_Domingo";
const day = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() + n * 86_400_000));
// UTC-4 fijo (sin DST en America/Santo_Domingo)
const at = (n, hm) => new Date(`${day(n)}T${hm}:00-04:00`).toISOString();

resetRateLimits();
const { browser, ctx, page, errors } = await launch({ width: 1280, height: 800 });
const api = async (method, path, body) => (await ctx.request.fetch(`${BASE}/api/v1${path}`, { method, headers: { Origin: BASE, "Content-Type": "application/json" }, data: body ? JSON.stringify(body) : undefined })).json();
await login(page);
async function cleanDemo() {
  resetRateLimits();
  for (const e of (await api("GET", "/events?q=Demo&pageSize=100")).data ?? []) if (e.title.startsWith("Demo")) await api("DELETE", `/events/${e.id}`);
  for (const t of (await api("GET", "/tasks?q=Demo&pageSize=100")).data ?? []) if (t.title.startsWith("Demo")) await api("DELETE", `/tasks/${t.id}`);
  for (const d of (await api("GET", "/special-dates?q=Demo&pageSize=100")).data ?? []) if (d.title.startsWith("Demo")) await api("DELETE", `/special-dates/${d.id}`);
}
await cleanDemo();
const cats = Object.fromEntries(((await api("GET", "/categories?pageSize=100")).data ?? []).map((c) => [c.name, c.id]));
const ids = { events: [], tasks: [], sds: [] };
const ev = async (b) => ids.events.push((await api("POST", "/events", { force: true, ...b })).data?.id);
await ev({ title: "Demo · Stand-up", startAt: at(0, "09:00"), endAt: at(0, "09:30"), categoryId: cats["Trabajo"] });
await ev({ title: "Demo · Clase de inglés", startAt: at(0, "15:00"), endAt: at(0, "16:00"), categoryId: cats["Inglés"], location: "Aula 3" });
await ev({ title: "Demo · Revisión del proyecto", startAt: at(0, "17:00"), endAt: at(0, "18:00"), categoryId: cats["Reuniones"], meetingUrl: "https://meet.google.com/abc-defg-hij", meetingProvider: "google_meet", isBlocking: true });
await ev({ title: "Demo · Cita médica", startAt: at(1, "10:00"), endAt: at(1, "11:30"), categoryId: cats["Actividades personales"] });
await ev({ title: "Demo · Entrega ITLA", isAllDay: true, startDate: day(2), endDate: day(3), categoryId: cats["Estudios ITLA"], status: "tentative" });
await ev({ title: "Demo · Sprint semanal", startAt: at(1, "14:00"), endAt: at(1, "15:00"), categoryId: cats["Trabajo"], recurrence: { freq: "weekly", interval: 1, byDay: ["TU", "TH"], count: 12 } });
await ev({ title: "Demo · Proyecto personal", startAt: at(3, "19:00"), endAt: at(3, "21:00"), categoryId: cats["Proyectos personales"] });
await ev({ title: "Demo · Gimnasio", startAt: at(-1, "06:30"), endAt: at(-1, "07:30") });
const task = async (b) => ids.tasks.push((await api("POST", "/tasks", b)).data?.id);
await task({ title: "Demo · Enviar informe", dueAt: at(-1, "17:00"), priority: "urgent", categoryId: cats["Trabajo"] });
await task({ title: "Demo · Estudiar capítulo 4", dueAt: at(0, "20:00"), priority: "high", categoryId: cats["Estudios ITLA"], tags: ["itla"] });
await task({ title: "Demo · Comprar regalo", dueAt: at(3, "12:00"), priority: "medium" });
const sd = async (b) => ids.sds.push((await api("POST", "/special-dates", b)).data?.id);
await sd({ title: "Demo · Cumpleaños de Ana", type: "birthday", date: `1995-${day(4).slice(5)}`, recursYearly: true, icon: "cake", color: "#db2777" });

async function shot(name, viewport, scheme) {
  resetRateLimits();
  await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: scheme });
  await page.evaluate((t) => localStorage.setItem("theme", t), scheme);
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}dashboard-${name}.png` });
  await page.goto(`${BASE}/calendar`);
  await page.waitForTimeout(500);
  await page.getByRole("tab", { name: viewport.width < 768 ? "Agenda" : "Mes" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}calendar-${name}.png`, fullPage: false });
  if (viewport.width >= 768) {
    await page.getByRole("tab", { name: "Semana" }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}calendar-week-${name}.png` });
  }
}
await shot("dark-1280", { width: 1280, height: 800 }, "dark");
await shot("light-1280", { width: 1280, height: 800 }, "light");
await shot("dark-390", { width: 390, height: 844 }, "dark");
await shot("light-390", { width: 390, height: 844 }, "light");

if (process.argv.includes("--all")) {
  for (const [scheme, vp, tag] of [["dark", { width: 1280, height: 800 }, "dark-1280"], ["dark", { width: 390, height: 844 }, "dark-390"]]) {
    await page.setViewportSize(vp);
    await page.evaluate((t) => localStorage.setItem("theme", t), scheme);
    resetRateLimits();
    for (const r of ["tasks", "special-dates", "categories", "notifications", "history", "settings", "agenda"]) {
      if (r === "special-dates" || r === "history") resetRateLimits();
      await page.goto(`${BASE}/${r}`);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}${r}-${tag}.png` });
    }
  }
}

// Formulario y detalle (móvil y escritorio)
for (const [vp, tag] of [[{ width: 1280, height: 800 }, "1280"], [{ width: 390, height: 844 }, "390"]]) {
  resetRateLimits();
  await page.setViewportSize(vp);
  await page.evaluate((t) => localStorage.setItem("theme", t), "dark");
  await page.goto(`${BASE}/calendar`);
  await page.getByRole("tab", { name: "Agenda" }).click();
  await page.waitForTimeout(1000);
  await page.locator(".fc").getByText("Demo · Revisión del proyecto").first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}event-detail-dark-${tag}.png` });
  await page.getByRole("button", { name: "Editar" }).click();
  await page.getByRole("dialog", { name: "Editar evento" }).getByLabel("Título").waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}event-form-dark-${tag}.png` });
  await page.keyboard.press("Escape");
}

// Limpieza de los datos de demostración
await cleanDemo();
const real = errors.filter((e) => !/ERR_TUNNEL|Failed to load resource|React DevTools/.test(e));
console.log(real.length ? `errores: ${real.slice(0, 3).join(" || ")}` : "sin errores de consola");
await browser.close();
