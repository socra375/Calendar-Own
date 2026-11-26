// Flujo E2E real contra `pnpm dev` (BD local con seed). Uso: node tests/e2e/flow.mjs
import { BASE, check, failed, launch, login, resetRateLimits } from "./helpers.mjs";

const TZ = "America/Santo_Domingo";
const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const tomorrow = ymd(new Date(Date.now() + 86_400_000));
const nextWeekDay = ymd(new Date(Date.now() + 8 * 86_400_000));

const { browser, ctx, page, errors } = await launch();
const api = async (method, path, body) => {
  const r = await ctx.request.fetch(`${BASE}/api/v1${path}`, { method, headers: { Origin: BASE, "Content-Type": "application/json" }, data: body ? JSON.stringify(body) : undefined });
  return r.json();
};

async function cleanup() {
  const ev = await api("GET", `/events?q=E2E&from=${ymd(new Date())}&to=${nextWeekDay.slice(0, 8)}28&pageSize=100&deleted=false`);
  const all = await api("GET", `/events?q=E2E&pageSize=100`);
  for (const e of all.data ?? []) if (e.title.startsWith("E2E")) await api("DELETE", `/events/${e.id}`);
  const tasks = await api("GET", `/tasks?q=E2E&pageSize=100`);
  for (const t of tasks.data ?? []) await api("DELETE", `/tasks/${t.id}`);
  const cats = await api("GET", `/categories?q=E2E&pageSize=100`);
  for (const c of cats.data ?? []) await api("DELETE", `/categories/${c.id}`);
  const sds = await api("GET", `/special-dates?q=E2E&pageSize=100`);
  for (const d of sds.data ?? []) await api("DELETE", `/special-dates/${d.id}`);
  const toks = await api("GET", `/tokens`);
  for (const t of toks.data ?? []) if (t.name.startsWith("E2E") && !t.revokedAt) await api("DELETE", `/tokens/${t.id}`);
  void ev;
}

try {
  resetRateLimits();
  await login(page);
  await cleanup();

  // ── 1. Login / dashboard
  await page.goto(`${BASE}/dashboard`);
  check("dashboard muestra saludo", await page.getByRole("heading", { level: 1 }).first().isVisible());
  check("sidebar con 9 destinos", (await page.locator('nav[aria-label="Principal"] a').count()) === 9);

  // ── 2. Crear evento (calendario → Nuevo evento)
  await page.goto(`${BASE}/calendar`);
  await page.getByRole("button", { name: "Nuevo evento" }).click();
  const dlg = page.getByRole("dialog", { name: "Nuevo evento" });
  await dlg.getByLabel("Título").fill("E2E Reunión");
  await dlg.getByLabel("Inicio", { exact: true }).fill(tomorrow);
  await dlg.getByLabel("Hora de inicio").fill("10:00");
  await dlg.getByLabel("Hora de fin").fill("11:00");
  await dlg.getByLabel("Categoría").selectOption({ label: "Reuniones" });
  await dlg.getByLabel("Ubicación").fill("Sala 1");
  await dlg.getByLabel("URL de videollamada").fill("https://meet.google.com/abc-defg-hij");
  check("detecta proveedor Google Meet", await dlg.getByText("Google Meet").isVisible());
  await dlg.getByRole("button", { name: "Crear evento" }).click();
  await page.getByText("Evento creado").first().waitFor();
  check("evento creado (toast)", true);
  let created = await api("GET", `/events?q=E2E%20Reuni&pageSize=10`);
  const ev = created.data?.find((e) => e.title === "E2E Reunión");
  check("evento existe en API con meetingProvider google_meet", ev?.meetingProvider === "google_meet" && ev?.localTime === "10:00", JSON.stringify({ t: ev?.localTime, p: ev?.meetingProvider }));

  // ── 3. Verlo en las 4 vistas
  async function seen(view) {
    await page.getByRole("tab", { name: view }).click();
    await page.waitForTimeout(700);
    return (await page.locator(".fc").getByText("E2E Reunión").first().isVisible().catch(() => false));
  }
  check("visible en vista Mes", await seen("Mes"));
  check("visible en vista Semana", await seen("Semana"));
  // Día: navegar al día de mañana si hace falta
  await page.getByRole("tab", { name: "Día" }).click();
  await page.waitForTimeout(500);
  if (!(await page.locator(".fc").getByText("E2E Reunión").first().isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.waitForTimeout(800);
  }
  check("visible en vista Día", await page.locator(".fc").getByText("E2E Reunión").first().isVisible().catch(() => false));
  await page.getByRole("tab", { name: "Agenda" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Hoy" }).click();
  await page.waitForTimeout(800);
  check("visible en vista Agenda", await page.locator(".fc").getByText("E2E Reunión").first().isVisible().catch(() => false));

  // ── 4. Arrastrarlo (semana): 10:00 → 12:00
  await page.getByRole("tab", { name: "Semana" }).click();
  await page.getByRole("button", { name: "Hoy" }).click();
  await page.waitForTimeout(900);
  const evEl = page.locator(".fc-timegrid-event", { hasText: "E2E Reunión" }).first();
  await evEl.scrollIntoViewIfNeeded();
  const box = await evEl.boundingBox();
  const lane0 = await page.locator(".fc-timegrid-slot-lane").nth(0).boundingBox();
  const lane1 = await page.locator(".fc-timegrid-slot-lane").nth(1).boundingBox();
  const slotH = lane1.y - lane0.y; // 30 min
  await page.mouse.move(box.x + box.width / 2, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 8 + slotH * 2, { steps: 8 });
  await page.mouse.move(box.x + box.width / 2, box.y + 8 + slotH * 4, { steps: 8 });
  await page.mouse.up();
  await page.getByText("Evento actualizado").first().waitFor({ timeout: 8000 }).catch(() => {});
  const moved = (await api("GET", `/events/${ev.id}`)).data;
  // FullCalendar ajusta el soltado a su rejilla de 15 min: se acepta 12:00 o 12:15 (desplazamiento ≈ +2 h, duración intacta)
  check("arrastrar mueve el evento ≈ +2 h (PATCH) conservando la duración", ["12:00", "12:15"].includes(moved?.localTime) && moved?.durationMinutes === 60, `${moved?.localTime}-${moved?.endLocalTime}`);

  resetRateLimits();
  // ── 5. Recurrente + editar una ocurrencia
  await page.getByRole("button", { name: "Nuevo evento" }).click();
  const d2 = page.getByRole("dialog", { name: "Nuevo evento" });
  await d2.getByLabel("Título").fill("E2E Semanal");
  await d2.getByLabel("Inicio", { exact: true }).fill(tomorrow);
  await d2.getByLabel("Hora de inicio").fill("15:00");
  await d2.getByLabel("Hora de fin").fill("16:00");
  await d2.getByLabel("Frecuencia").selectOption("weekly");
  await d2.getByLabel("Termina").selectOption("count");
  await d2.getByLabel("Repeticiones").fill("4");
  await d2.getByRole("button", { name: "Crear evento" }).click();
  await page.getByText("Evento creado").first().waitFor();
  const series = (await api("GET", `/events?q=E2E%20Semanal&pageSize=10`)).data?.find((e) => e.title === "E2E Semanal");
  check("serie recurrente creada (4 repeticiones)", series?.isRecurring && series.recurrence?.count === 4, JSON.stringify(series?.recurrence));

  await page.getByRole("tab", { name: "Agenda" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click(); // semana siguiente: 2.ª ocurrencia
  await page.waitForTimeout(900);
  await page.locator(".fc").getByText("E2E Semanal").first().click();
  const det = page.getByRole("dialog", { name: "Detalle del evento" });
  await det.getByRole("button", { name: "Editar" }).click();
  const scope = page.getByRole("dialog", { name: "Editar evento recurrente" });
  check("diálogo de alcance (solo este / siguientes / toda)", (await scope.getByText("Solo este evento").isVisible()) && (await scope.getByText("Este y los siguientes").isVisible()) && (await scope.getByText("Toda la serie").isVisible()));
  await scope.getByLabel("Solo este evento").check();
  await scope.getByRole("button", { name: "Continuar" }).click();
  const edit = page.getByRole("dialog", { name: "Editar evento" });
  await edit.getByLabel("Título").waitFor();
  await edit.getByLabel("Título").fill("E2E Semanal (solo esta)");
  await edit.getByRole("button", { name: "Guardar cambios" }).click();
  await page.getByText("Evento actualizado").first().waitFor();
  const occs = (await api("GET", `/events?q=E2E&from=${tomorrow}&to=${ymd(new Date(Date.now() + 40 * 86_400_000))}&pageSize=100`)).data ?? [];
  const names = occs.map((o) => o.title);
  check("solo una ocurrencia editada; las demás intactas", names.filter((n) => n === "E2E Semanal (solo esta)").length === 1 && names.filter((n) => n === "E2E Semanal").length === 3, names.join(" | "));
  const masterAfter = (await api("GET", `/events/${series.id}`)).data;
  check("la serie maestra conserva su título", masterAfter.title === "E2E Semanal");



  // ── 5e. Arrastrar ocurrencia recurrente → diálogo de alcance → «Toda la serie» desplaza el maestro
  resetRateLimits();
  await page.goto(`${BASE}/calendar`);
  await page.getByRole("tab", { name: "Semana" }).click();
  await page.getByRole("button", { name: "Hoy" }).click();
  await page.waitForTimeout(900);
  const masterBefore = (await api("GET", `/events/${series.id}`)).data;
  const rec = page.locator(".fc-timegrid-event", { hasText: "E2E Semanal" }).first();
  await rec.scrollIntoViewIfNeeded();
  const rb = await rec.boundingBox();
  const l0 = await page.locator(".fc-timegrid-slot-lane").nth(0).boundingBox();
  const l1 = await page.locator(".fc-timegrid-slot-lane").nth(1).boundingBox();
  await page.mouse.move(rb.x + rb.width / 2, rb.y + 8);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width / 2, rb.y + 8 + (l1.y - l0.y) * 2, { steps: 10 });
  await page.mouse.up();
  const sc = page.getByRole("dialog", { name: "Mover evento recurrente" });
  await sc.waitFor({ timeout: 6000 });
  check("arrastrar ocurrencia recurrente pide alcance", true);
  await sc.getByLabel("Toda la serie").check();
  await sc.getByRole("button", { name: "Aplicar" }).click();
  await page.getByText("Evento actualizado").first().waitFor({ timeout: 8000 });
  const masterAfter2 = (await api("GET", `/events/${series.id}`)).data;
  const shiftMin = (Date.parse(masterAfter2.startAt) - Date.parse(masterBefore.startAt)) / 60000;
  check("«Toda la serie» desplaza el evento maestro (≈ +1 h; la rejilla de 15 min añade un sesgo) sin tocar la duración", shiftMin >= 45 && shiftMin <= 90 && masterAfter2.durationMinutes === 60 && masterAfter2.isRecurring, `shift ${shiftMin} min`);

  // ── 5f. Selección de rango en el calendario → formulario precargado
  await page.getByRole("tab", { name: "Día" }).click();
  await page.waitForTimeout(700);
  await page.locator(".fc-timegrid-slot-lane").nth(24).scrollIntoViewIfNeeded();
  const lane = await page.locator(".fc-timegrid-slot-lane").nth(20).boundingBox();
  const lane2 = await page.locator(".fc-timegrid-slot-lane").nth(22).boundingBox();
  const cx = lane.x + lane.width / 2;
  await page.mouse.move(cx, lane.y + 3);
  await page.mouse.down();
  await page.mouse.move(cx, lane.y + 20, { steps: 4 });
  await page.mouse.move(cx, lane2.y + 3, { steps: 8 });
  await page.mouse.up();
  const sel = page.getByRole("dialog", { name: "Nuevo evento" });
  await sel.waitFor({ timeout: 6000 });
  check("seleccionar un rango abre «Nuevo evento» con la hora precargada", (await sel.getByLabel("Hora de inicio").inputValue()) === "10:00" && ["11:00", "11:15"].includes(await sel.getByLabel("Hora de fin").inputValue()), `${await sel.getByLabel("Hora de inicio").inputValue()}-${await sel.getByLabel("Hora de fin").inputValue()}`);
  await sel.getByRole("button", { name: "Cancelar" }).click();

  // ── 5g. Editar «este y los siguientes» desde la UI
  resetRateLimits();
  await page.goto(`${BASE}/calendar`);
  await page.getByRole("tab", { name: "Agenda" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click(); // 3.ª ocurrencia
  await page.waitForTimeout(900);
  await page.locator(".fc").getByText("E2E Semanal").first().click();
  await page.getByRole("dialog", { name: "Detalle del evento" }).getByRole("button", { name: "Editar" }).click();
  const sc2 = page.getByRole("dialog", { name: "Editar evento recurrente" });
  await sc2.getByLabel("Este y los siguientes").check();
  await sc2.getByRole("button", { name: "Continuar" }).click();
  const ed2 = page.getByRole("dialog", { name: "Editar evento" });
  await ed2.getByLabel("Título").fill("E2E Semanal v2");
  await ed2.getByRole("button", { name: "Guardar cambios" }).click();
  await page.getByText("Evento actualizado").first().waitFor();
  const occs2 = ((await api("GET", `/events?q=E2E&from=${tomorrow}&to=${ymd(new Date(Date.now() + 40 * 86_400_000))}&pageSize=100`)).data ?? []).map((o) => o.title);
  check("«este y los siguientes» divide la serie (2 ocurrencias antiguas + 2 de la serie nueva)", occs2.filter((n) => n.startsWith("E2E Semanal v2")).length === 2 && occs2.filter((n) => n === "E2E Semanal").length === 2, occs2.filter((n) => n.startsWith("E2E Sem")).join(" | "));

  // ── 5h. Evento de día completo
  await page.getByRole("button", { name: "Nuevo evento" }).click();
  const ad = page.getByRole("dialog", { name: "Nuevo evento" });
  await ad.getByLabel("Título").fill("E2E Todo el día");
  await ad.getByRole("switch", { name: "Todo el día" }).click();
  await ad.getByLabel("Primer día").fill(nextWeekDay);
  await ad.getByLabel("Último día").fill(nextWeekDay);
  await ad.getByRole("button", { name: "Crear evento" }).click();
  await page.getByText("Evento creado").first().waitFor();
  const allDay = (await api("GET", `/events?q=E2E%20Todo&pageSize=5`)).data?.[0];
  check("evento de día completo (endDate exclusivo = +1 día)", allDay?.isAllDay === true && allDay.startDate === nextWeekDay && allDay.endDate > allDay.startDate, `${allDay?.startDate}→${allDay?.endDate}`);

  // ── 5f2. Redimensionar (resize) → PATCH con nueva duración
  const rz = (await api("POST", "/events", { title: "E2E Resize", startAt: `${tomorrow}T14:00:00.000Z`, endAt: `${tomorrow}T15:00:00.000Z`, force: true })).data;
  await page.getByRole("tab", { name: "Semana" }).click();
  await page.getByRole("button", { name: "Hoy" }).click();
  await page.waitForTimeout(1000);
  const rzEl = page.locator(".fc-timegrid-event", { hasText: "E2E Resize" }).first();
  await rzEl.scrollIntoViewIfNeeded();
  await rzEl.hover();
  const handle = rzEl.locator(".fc-event-resizer-end");
  const hb = await handle.boundingBox();
  const m0 = await page.locator(".fc-timegrid-slot-lane").nth(0).boundingBox();
  const m1 = await page.locator(".fc-timegrid-slot-lane").nth(1).boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 20, { steps: 4 });
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 2 * (m1.y - m0.y), { steps: 8 });
  await page.mouse.up();
  let rzAfter = rz;
  for (let i = 0; i < 20 && rzAfter.durationMinutes === rz.durationMinutes; i++) {
    await page.waitForTimeout(300);
    rzAfter = (await api("GET", `/events/${rz.id}`)).data;
  }
  check("redimensionar cambia la duración (PATCH endAt)", rzAfter.durationMinutes >= 105 && rzAfter.durationMinutes <= 135 && rzAfter.localTime === rz.localTime, `${rz.durationMinutes} → ${rzAfter.durationMinutes} min`);
  resetRateLimits();
  // ── 5b. Conflicto bloqueante: advertencia en vivo + «guardar de todos modos» (force)
  const blk = await api("POST", "/events", { title: "E2E Bloqueo", startAt: `${tomorrow}T20:00:00.000Z`, endAt: `${tomorrow}T21:00:00.000Z`, isBlocking: true, force: true });
  check("evento bloqueante sembrado por API", blk.success === true, blk.message);
  await page.goto(`${BASE}/calendar`);
  await page.getByRole("button", { name: "Nuevo evento" }).click();
  const d3 = page.getByRole("dialog", { name: "Nuevo evento" });
  await d3.getByLabel("Título").fill("E2E Choque");
  await d3.getByLabel("Inicio", { exact: true }).fill(tomorrow);
  await d3.getByLabel("Hora de inicio").fill("16:30"); // 20:30Z en UTC-4
  await d3.getByLabel("Hora de fin").fill("17:30");
  await d3.getByText("E2E Bloqueo").first().waitFor({ timeout: 6000 }).catch(() => {});
  check("advertencia de conflicto en vivo visible", await d3.getByText("E2E Bloqueo").first().isVisible().catch(() => false));
  await d3.getByRole("button", { name: "Crear evento" }).click();
  await d3.getByRole("button", { name: "Guardar de todos modos" }).waitFor({ timeout: 6000 });
  check("409 BLOCKING_CONFLICT ofrece «Guardar de todos modos»", true);
  const before = (await api("GET", `/events?q=E2E%20Choque&pageSize=10`)).data?.length ?? 0;
  check("el evento en conflicto NO se guardó antes de forzar", before === 0);
  await d3.getByRole("button", { name: "Guardar de todos modos" }).click();
  await page.getByText(/Evento creado/).first().waitFor();
  const after = (await api("GET", `/events?q=E2E%20Choque&pageSize=10`)).data?.length ?? 0;
  check("con force:true el evento se guarda", after === 1);

  // ── 5c. Duplicar y eliminar con confirmación
  await page.getByRole("tab", { name: "Agenda" }).click();
  await page.getByRole("button", { name: "Hoy" }).click();
  await page.waitForTimeout(800);
  await page.locator(".fc").getByText("E2E Reunión").first().click();
  await page.getByRole("dialog", { name: "Detalle del evento" }).getByRole("button", { name: "Duplicar" }).click();
  await page.getByText(/Evento duplicado/).first().waitFor({ timeout: 8000 });
  const copies = (await api("GET", `/events?q=E2E%20Reuni&pageSize=10`)).data ?? [];
  check("duplicar crea «(copia)» y abre su edición", copies.some((e) => e.title === "E2E Reunión (copia)") && (await page.getByRole("dialog", { name: "Editar evento" }).isVisible()));
  await page.getByRole("dialog", { name: "Editar evento" }).getByRole("button", { name: "Cancelar" }).click();
  await page.locator(".fc").getByText("E2E Reunión").first().click();
  await page.getByRole("dialog", { name: "Detalle del evento" }).getByRole("button", { name: "Eliminar" }).click();
  const conf = page.getByRole("dialog", { name: "¿Eliminar este evento?" });
  check("eliminar pide confirmación", await conf.isVisible());
  await conf.getByRole("button", { name: "Eliminar" }).click();
  await page.getByText("Evento eliminado").first().waitFor();
  check("evento eliminado (404 en API)", (await ctx.request.get(`${BASE}/api/v1/events/${ev.id}`)).status() === 404);

  resetRateLimits();
  // ── 5d. Búsqueda global ⌘K
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: /Buscar eventos/ }).fill("E2E Sem");
  const results = page.getByRole("listbox", { name: "Resultados" }).getByRole("option");
  await results.first().waitFor({ timeout: 6000 });
  check("búsqueda global ⌘K devuelve resultados reales", (await results.count()) > 0);
  await page.keyboard.press("Escape");
  resetRateLimits();
  // ── 6. Tarea: crear y completar
  await page.goto(`${BASE}/tasks`);
  await page.getByRole("button", { name: "Nueva tarea" }).first().click();
  const td = page.getByRole("dialog", { name: "Nueva tarea" });
  await td.getByLabel("Título").fill("E2E Tarea");
  await td.getByLabel("Vence").fill(tomorrow);
  await td.getByLabel("Prioridad").selectOption("high");
  await td.getByRole("button", { name: "Crear tarea" }).click();
  await page.getByText("Tarea creada").first().waitFor();
  await page.getByRole("checkbox", { name: /Completar «E2E Tarea»/ }).click();
  await page.getByText("Tarea completada").first().waitFor();
  const task = (await api("GET", `/tasks?q=E2E&status=completed`)).data?.find((t) => t.title === "E2E Tarea");
  check("tarea creada y completada (API: completed)", task?.status === "completed" && !!task.completedAt);
  await page.getByRole("tab", { name: "Completadas" }).click();
  await page.waitForTimeout(600);
  check("tarea visible en pestaña Completadas", await page.getByText("E2E Tarea").first().isVisible());

  // ── 7. Categoría
  await page.goto(`${BASE}/categories`);
  await page.getByRole("button", { name: "Nueva categoría" }).click();
  const cd = page.getByRole("dialog", { name: "Nueva categoría" });
  await cd.getByLabel("Nombre").fill("E2E Cat");
  await cd.getByRole("button", { name: "Crear categoría" }).click();
  await page.getByText("Categoría creada").first().waitFor();
  await page.getByText("E2E Cat").first().waitFor({ timeout: 8000 }).catch(() => {});
  check("categoría aparece en la lista", await page.getByText("E2E Cat").first().isVisible());


  // ── 7b. Fechas especiales: crear / eliminar
  resetRateLimits();
  await page.goto(`${BASE}/special-dates`);
  await page.getByRole("button", { name: "Nueva fecha" }).first().click();
  const sd = page.getByRole("dialog", { name: "Nueva fecha especial" });
  await sd.getByLabel("Título").fill("E2E Cumpleaños");
  await sd.getByLabel("Fecha", { exact: false }).first().fill(`1990-${nextWeekDay.slice(5)}`);
  await sd.getByRole("button", { name: "Crear fecha" }).click();
  await page.getByText("Fecha creada").first().waitFor();
  const sdApi = (await api("GET", `/special-dates?q=E2E&pageSize=5`)).data?.[0];
  check("fecha especial creada con cuenta atrás (daysUntil)", sdApi?.title === "E2E Cumpleaños" && typeof sdApi.daysUntil === "number", `daysUntil=${sdApi?.daysUntil}`);
  await page.getByRole("button", { name: /Acciones de «E2E Cumpleaños»/ }).click();
  await page.getByRole("menuitem", { name: "Eliminar" }).click();
  await page.getByRole("dialog", { name: "¿Eliminar fecha especial?" }).getByRole("button", { name: "Eliminar" }).click();
  await page.getByText("Fecha eliminada").first().waitFor();
  check("fecha especial eliminada", ((await api("GET", `/special-dates?q=E2E&pageSize=5`)).data ?? []).length === 0);

  // ── 7c. Notificaciones: prueba interna → campana → bandeja → marcar leída
  resetRateLimits();
  await page.goto(`${BASE}/settings`);
  await page.getByRole("button", { name: "Enviar prueba" }).nth(2).click(); // interno
  await page.getByText("Mensaje de prueba enviado").first().waitFor();
  await page.waitForTimeout(800);
  check("campana muestra no leídas", /sin leer/.test((await page.locator('header a[href="/notifications"]').getAttribute("aria-label")) ?? ""));
  await page.goto(`${BASE}/notifications`);
  await page.getByText("Notificación de prueba").first().waitFor();
  const unreadBefore = (await api("GET", `/notifications?unread=true&channel=internal&pageSize=1`)).pagination?.total;
  await page.getByRole("button", { name: "Marcar como leída" }).first().click();
  await page.waitForTimeout(800);
  const unreadAfter = (await api("GET", `/notifications?unread=true&channel=internal&pageSize=1`)).pagination?.total;
  check("marcar leída actualiza la bandeja (API: -1 sin leer)", unreadAfter === unreadBefore - 1, `${unreadBefore} → ${unreadAfter}`);

  // ── 7d. Historial
  await page.goto(`${BASE}/history`);
  await page.getByPlaceholder("Acción: event.* / task.create").fill("event.*");
  await page.getByText("event.create").first().waitFor({ timeout: 8000 });
  check("historial lista acciones de auditoría con filtro event.*", (await page.getByText(/^event\./).count()) > 0);
  resetRateLimits();
  // ── 8. Settings: prueba de canal sin configurar + token
  await page.goto(`${BASE}/settings`);
  await page.getByRole("button", { name: "Enviar prueba" }).nth(1).click(); // email
  await page.getByRole("alert").filter({ hasText: "CHANNEL" }).first().waitFor({ timeout: 8000 });
  const errText = await page.getByRole("alert").filter({ hasText: "CHANNEL" }).first().innerText();
  check("prueba de email muestra el error real del canal", /CHANNEL_NOT_CONFIGURED/.test(errText), errText.slice(0, 120));
  await page.getByRole("button", { name: "Nuevo token" }).click();
  const tk = page.getByRole("dialog", { name: "Nuevo token de API" });
  await tk.getByLabel("Nombre").fill("E2E token");
  await tk.getByRole("button", { name: "Crear token" }).click();
  const reveal = page.getByRole("dialog", { name: "Copia tu token ahora" });
  const tokenText = await reveal.getByTestId("token-value").innerText();
  check("token mostrado una vez (pc_…)", tokenText.startsWith("pc_") && tokenText.length > 30);
  check("no se puede cerrar sin copiar", await reveal.getByRole("button", { name: "Ya lo guardé" }).isDisabled());
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await reveal.getByRole("button", { name: "Copiar" }).click();
  await reveal.getByRole("button", { name: "Ya lo guardé" }).click();
  await page.waitForTimeout(500);
  check("token listado con prefijo, sin valor completo", (await page.getByText(`${tokenText.slice(0, 12)}…`).first().isVisible()) && !(await page.getByText(tokenText).count()));
  // El token funciona contra la API como Bearer
  const viaBearer = await fetch(`${BASE}/api/v1/settings`, { headers: { Authorization: `Bearer ${tokenText}` } });
  check("el token nuevo autentica en la API", viaBearer.status === 200);
  await page.getByRole("button", { name: "Revocar" }).first().click();
  await page.getByRole("dialog", { name: "¿Revocar token?" }).getByRole("button", { name: "Revocar" }).click();
  await page.getByText("Token revocado").first().waitFor();
  const afterRevoke = await fetch(`${BASE}/api/v1/settings`, { headers: { Authorization: `Bearer ${tokenText}` } });
  check("token revocado deja de funcionar (401)", afterRevoke.status === 401);

  // ── 9. Logout
  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await page.waitForURL("**/login");
  check("logout redirige a /login", true);
  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL("**/login**");
  check("sin sesión, /dashboard redirige a login", page.url().includes("/login"));
} catch (e) {
  check("flujo sin excepciones", false, String(e).split("\n").slice(0, 6).join(" / "));
  await page.screenshot({ path: "/tmp/claude-0/fail.png" }).catch(() => {});
} finally {
  resetRateLimits();
  await login(page).catch(() => {});
  await cleanup().catch(() => {});
  const real = errors.filter((e) => !/ERR_TUNNEL|Failed to load resource|React DevTools/.test(e));
  check("sin errores de consola/página", real.length === 0, real.slice(0, 3).join(" || "));
  await browser.close();
  console.log(failed() ? `\n${failed()} comprobaciones fallaron` : "\nTodas las comprobaciones pasaron");
  process.exit(failed() ? 1 : 0);
}
