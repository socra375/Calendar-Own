// Auditoría ligera de accesibilidad y responsive (sin dependencias extra). Uso: node tests/e2e/audit.mjs
import { BASE, check, failed, launch, login, resetRateLimits } from "./helpers.mjs";

const ROUTES = ["dashboard", "calendar", "agenda", "tasks", "special-dates", "categories", "notifications", "history", "settings"];

async function audit(page, route, vw) {
  return page.evaluate((vw) => {
    const name = (el) =>
      (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.textContent || el.textContent || el.getAttribute("title") || "").trim();
    const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const issues = [];
    document.querySelectorAll("button, a[href], [role=button], [role=tab], [role=menuitem], [role=checkbox], [role=switch]").forEach((el) => {
      if (vis(el) && !name(el)) issues.push(`sin nombre accesible: <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 40)}">`);
    });
    document.querySelectorAll("input:not([type=hidden]):not([type=color]), select, textarea").forEach((el) => {
      if (!vis(el)) return;
      const labelled = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest("label");
      if (!labelled) issues.push(`control sin etiqueta: <${el.tagName.toLowerCase()} type=${el.type}>`);
    });
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) issues.push(`ids duplicados: ${[...new Set(dup)].slice(0, 5).join(",")}`);
    if (document.querySelectorAll("main").length !== 1) issues.push("debe haber exactamente un <main>");
    if (document.querySelectorAll("h1").length !== 1) issues.push(`h1 count=${document.querySelectorAll("h1").length}`);
    if (!document.querySelector("header")) issues.push("sin <header>");
    if (!document.querySelector("nav[aria-label]")) issues.push("sin <nav> etiquetado");
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    if (overflow > 1) issues.push(`desbordamiento horizontal de ${overflow}px`);
    if (vw < 768) {
      const small = [...document.querySelectorAll("button, a[href], [role=tab], [role=checkbox], select, input:not([type=checkbox]):not([type=radio]):not([type=color])")].filter((e) => vis(e) && !e.closest(".fc") && !e.classList.contains("sr-only") && !e.closest(".sr-only"));
      // Los switches amplían su área pulsable con un ::before (-inset-3): el rect del botón no la refleja.
      const tiny = small.filter((e) => e.getAttribute("role") !== "switch").filter((e) => { const r = e.getBoundingClientRect(); return r.height < 43.5 && r.width * r.height > 0; });
      if (tiny.length) issues.push(`objetivos táctiles < 44px: ${tiny.slice(0, 4).map((e) => `${e.tagName.toLowerCase()}"${name(e).slice(0, 20)}"(${Math.round(e.getBoundingClientRect().height)}px)`).join(", ")}`);
    }
    return issues;
  }, vw);
}

for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  resetRateLimits();
  const { browser, page } = await launch(vp);
  await login(page);
  for (const r of ROUTES) {
    await page.goto(`${BASE}/${r}`);
    await page.waitForTimeout(1300);
    const issues = await audit(page, r, vp.width);
    check(`${vp.width}px /${r}: a11y + responsive`, issues.length === 0, issues.join(" | "));
  }
  await browser.close();
}
console.log(failed() ? `\n${failed()} páginas con incidencias` : "\nSin incidencias");
process.exit(failed() ? 1 : 0);
