"use client";

import { Activity, Bell, Check, Clock, Copy, ExternalLink, KeyRound, Mail, Palette, Plus, RotateCw, Send, ShieldOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "@/components/layout/app-context";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/pickers";
import { ErrorState, PageHeader, Panel, Skeleton } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { fmtDateTime, minutesLabel, zonedToIso } from "@/lib/datetime";
import type { HealthDto, SettingsDto, TokenDto } from "@/lib/types";
import { errMsg, useApiQuery } from "@/lib/use-api";
import { useNow } from "@/lib/use-now";
import { useMounted } from "@/lib/use-pref";
import { settingsUpdateBody } from "@/lib/validation/settings";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];

function Section({ id, icon, title, description, children }: { id: string; icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <Panel aria-labelledby={id} className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-control border border-line bg-surface-2 text-accent [&>svg]:size-4">{icon}</span>
        <div>
          <h2 id={id} className="text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </Panel>
  );
}

export function SettingsView() {
  const q = useApiQuery<SettingsDto>("/api/v1/settings");
  return (
    <div>
      <PageHeader title="Ajustes" subtitle="Apariencia, zona horaria, avisos, canales y acceso de Eddie." />
      {q.loading ? (
        <div className="space-y-4" role="status" aria-label="Cargando ajustes">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : q.error && !q.data ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : q.data ? (
        <SettingsBody s={q.data} />
      ) : null}
    </div>
  );
}

function useSave() {
  const app = useApp();
  const toast = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  async function save(key: string, body: Record<string, unknown>, msg = "Ajustes guardados") {
    const parsed = settingsUpdateBody.safeParse(body);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return false;
    }
    setSaving(key);
    try {
      await apiFetch("/api/v1/settings", { method: "PATCH", body });
      toast.success(msg);
      app.bump();
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setSaving(null);
    }
  }
  return { save, saving };
}

function SettingsBody({ s }: { s: SettingsDto }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Appearance s={s} />
        <Timezone s={s} />
        <DefaultReminders s={s} />
      </div>
      <div className="space-y-4">
        <Channels s={s} />
        <Tokens />
        <ApiStatus />
      </div>
    </div>
  );
}

function Appearance({ s }: { s: SettingsDto }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const { save, saving } = useSave();
  const [displayName, setDisplayName] = useState(s.displayName ?? "");
  const [weekStartsOn, setWeek] = useState(s.weekStartsOn);
  const opts = [
    { id: "light", label: "Claro" },
    { id: "dark", label: "Oscuro" },
    { id: "system", label: "Sistema" },
  ] as const;
  return (
    <Section id="s-appearance" icon={<Palette />} title="Apariencia" description="Tema, nombre y primer día de la semana.">
      <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">
        {opts.map((o) => {
          const on = mounted && theme === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setTheme(o.id);
                void save("theme", { theme: o.id }, "Tema guardado");
              }}
              className={cn("h-11 rounded-control border text-sm transition-colors md:h-10", on ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:border-line-strong hover:text-fg")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre para mostrar">{(p) => <Input {...p} maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}</Field>
        <Field label="La semana empieza el">
          {(p) => (
            <Select {...p} value={weekStartsOn} onChange={(e) => setWeek(Number(e.target.value))}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>{["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][i]}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Button variant="primary" loading={saving === "app"} onClick={() => void save("app", { displayName: displayName.trim() || null, weekStartsOn })}>
        Guardar
      </Button>
    </Section>
  );
}

function Timezone({ s }: { s: SettingsDto }) {
  const { save, saving } = useSave();
  const [timezone, setTz] = useState(s.timezone);
  const [start, setStart] = useState(s.workDayStart.slice(0, 5));
  const [end, setEnd] = useState(s.workDayEnd.slice(0, 5));
  const [days, setDays] = useState<number[]>(s.workDays);
  const zones = useMemo(() => {
    const list = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return list.includes(timezone) ? list : [timezone, ...list];
  }, [timezone]);
  return (
    <Section id="s-tz" icon={<Clock />} title="Zona horaria y horario laboral" description="Se usa para 'hoy', recurrencias, huecos libres y el calendario.">
      <Field label="Zona horaria">
        {(p) => (
          <Select {...p} value={timezone} onChange={(e) => setTz(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inicio de jornada">{(p) => <Input {...p} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="Fin de jornada">{(p) => <Input {...p} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
      </div>
      <div role="group" aria-label="Días laborables" className="flex flex-wrap gap-1.5">
        {DAYS.map((d, i) => {
          const on = days.includes(i);
          return (
            <button key={d} type="button" aria-pressed={on} onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i].sort())} className={cn("h-11 min-w-12 rounded-control border px-3 font-mono text-xs transition-colors md:h-9", on ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:border-accent hover:text-accent")}>
              {d}
            </button>
          );
        })}
      </div>
      <Button variant="primary" loading={saving === "tz"} onClick={() => void save("tz", { timezone, workDayStart: start, workDayEnd: end, workDays: days })}>
        Guardar
      </Button>
    </Section>
  );
}

function DefaultReminders({ s }: { s: SettingsDto }) {
  const { save, saving } = useSave();
  const [list, setList] = useState(s.defaultReminders);
  return (
    <Section id="s-rem" icon={<Bell />} title="Recordatorios por defecto" description="Se precargan al crear un evento nuevo (puedes cambiarlos en cada uno).">
      {list.length === 0 && <p className="text-sm text-muted">Sin recordatorios por defecto.</p>}
      <ul className="space-y-2">
        {list.map((r, i) => (
          <li key={i} className="flex items-center gap-2">
            <Select aria-label="Cuándo avisar" value={PRESETS.includes(r.offsetMinutes) ? r.offsetMinutes : "x"} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, offsetMinutes: Number(e.target.value) } : x)))}>
              {PRESETS.map((m) => (
                <option key={m} value={m}>{minutesLabel(m)}</option>
              ))}
              {!PRESETS.includes(r.offsetMinutes) && <option value="x">{minutesLabel(r.offsetMinutes)}</option>}
            </Select>
            <Select aria-label="Canal" className="max-w-32" value={r.channel} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, channel: e.target.value as typeof r.channel } : x)))}>
              <option value="internal">Interno</option>
              <option value="telegram">Telegram</option>
              <option value="email">Email</option>
            </Select>
            <Button variant="ghost" size="icon" aria-label="Quitar" onClick={() => setList(list.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={list.length >= 10} onClick={() => setList([...list, { offsetMinutes: 15, channel: "internal" }])}>
          <Plus className="size-3.5" aria-hidden /> Añadir
        </Button>
        <Button variant="primary" size="sm" loading={saving === "rem"} onClick={() => void save("rem", { defaultReminders: list })}>
          Guardar
        </Button>
      </div>
    </Section>
  );
}

type Channel = "internal" | "telegram" | "email";
function TestResult({ r }: { r?: { ok: boolean; text: string } }) {
  if (!r) return null;
  return (
    <p role={r.ok ? "status" : "alert"} className={cn("rounded-control border px-3 py-2 font-mono text-xs break-words", r.ok ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger")}>
      {r.text}
    </p>
  );
}
function Channels({ s }: { s: SettingsDto }) {
  const { save, saving } = useSave();
  const toast = useToast();
  const app = useApp();
  const [tgOn, setTgOn] = useState(s.telegramEnabled);
  const [tgChat, setTgChat] = useState(s.telegramChatId ?? "");
  const [emOn, setEmOn] = useState(s.emailEnabled);
  const [emTo, setEmTo] = useState(s.notificationEmail ?? "");
  const [testing, setTesting] = useState<Channel | null>(null);
  const [results, setResults] = useState<Partial<Record<Channel, { ok: boolean; text: string }>>>({});

  const tgBody = { telegramEnabled: tgOn, telegramChatId: tgChat.trim() || null };
  const emBody = { emailEnabled: emOn, notificationEmail: emTo.trim() || null };
  const dirty = (ch: Channel) =>
    ch === "telegram" ? tgOn !== s.telegramEnabled || (tgChat.trim() || null) !== s.telegramChatId : ch === "email" ? emOn !== s.emailEnabled || (emTo.trim() || null) !== s.notificationEmail : false;

  async function test(ch: Channel) {
    setTesting(ch);
    try {
      if (dirty(ch)) {
        const ok = await save(ch, ch === "telegram" ? tgBody : emBody, "Canal guardado");
        if (!ok) return;
      }
      await apiFetch("/api/v1/notifications/test", { method: "POST", body: { channel: ch } });
      setResults((r) => ({ ...r, [ch]: { ok: true, text: "Mensaje de prueba enviado correctamente." } }));
      toast.success("Mensaje de prueba enviado");
      app.bump();
    } catch (e) {
      const text = e instanceof ApiClientError ? (e.message.startsWith(e.code) ? e.message : `${e.code}: ${e.message}`) : errMsg(e);
      setResults((r) => ({ ...r, [ch]: { ok: false, text } }));
      toast.error(text);
      app.bump();
    } finally {
      setTesting(null);
    }
  }

  return (
    <Section id="s-channels" icon={<Send />} title="Canales de aviso" description="El canal interno siempre funciona. Telegram y email necesitan credenciales en el servidor.">
      <div className="space-y-3 rounded-card border border-line p-3">
        <Switch checked={tgOn} onChange={setTgOn} label="Telegram" description="Requiere TELEGRAM_BOT_TOKEN en el servidor." />
        <Field label="Chat ID de Telegram" hint="Tiene prioridad sobre TELEGRAM_CHAT_ID del servidor.">{(p) => <Input {...p} className="font-mono" value={tgChat} onChange={(e) => setTgChat(e.target.value)} placeholder="123456789" />}</Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" loading={saving === "telegram"} onClick={() => void save("telegram", tgBody)}>Guardar</Button>
          <Button variant="outline" size="sm" loading={testing === "telegram"} onClick={() => void test("telegram")}><Send className="size-3.5" aria-hidden /> Enviar prueba</Button>
        </div>
        <TestResult r={results.telegram} />
      </div>
      <div className="space-y-3 rounded-card border border-line p-3">
        <Switch checked={emOn} onChange={setEmOn} label="Email" description="Requiere RESEND_API_KEY y EMAIL_FROM en el servidor." />
        <Field label="Correo de destino">{(p) => <Input {...p} type="email" value={emTo} onChange={(e) => setEmTo(e.target.value)} placeholder="tu@correo.com" />}</Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" loading={saving === "email"} onClick={() => void save("email", emBody)}>Guardar</Button>
          <Button variant="outline" size="sm" loading={testing === "email"} onClick={() => void test("email")}><Mail className="size-3.5" aria-hidden /> Enviar prueba</Button>
        </div>
        <TestResult r={results.email} />
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-line p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Canal interno</p>
          <p className="text-xs text-muted">Aparece en la bandeja de notificaciones.</p>
        </div>
        <Button variant="outline" size="sm" loading={testing === "internal"} onClick={() => void test("internal")}>Enviar prueba</Button>
        <div className="basis-full empty:hidden"><TestResult r={results.internal} /></div>
      </div>
    </Section>
  );
}

// ───────── Tokens de Eddie ─────────
function Tokens() {
  const app = useApp();
  const toast = useToast();
  const q = useApiQuery<TokenDto[]>("/api/v1/tokens");
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState<{ token: string; name: string } | null>(null);
  const [rotate, setRotate] = useState<TokenDto | null>(null);
  const [revoke, setRevoke] = useState<TokenDto | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow();

  async function doRotate() {
    if (!rotate) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ token: string; record: TokenDto }>(`/api/v1/tokens/${rotate.id}/rotate`, { method: "POST" });
      setShown({ token: r.data.token, name: r.data.record.name });
      setRotate(null);
      app.bump();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function doRevoke() {
    if (!revoke) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/tokens/${revoke.id}`, { method: "DELETE" });
      toast.success("Token revocado");
      setRevoke(null);
      app.bump();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const tokens = q.data ?? [];
  return (
    <Section id="s-tokens" icon={<KeyRound />} title="Tokens de Eddie" description="Acceso de la API para el agente. El valor completo solo se muestra al crearlo o rotarlo.">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" aria-hidden /> Nuevo token
        </Button>
      </div>
      {q.loading ? (
        <Skeleton className="h-16" />
      ) : q.error && !q.data ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : tokens.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong p-4 text-center text-sm text-muted">Aún no hay tokens. Crea uno para que Eddie use la API.</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line">
          {tokens.map((t) => {
            const revoked = !!t.revokedAt;
            const expired = !revoked && !!t.expiresAt && now > 0 && Date.parse(t.expiresAt) < now;
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className={cn(revoked && "line-through opacity-60")}>{t.name}</span>
                    {revoked && <Badge tone="danger">Revocado</Badge>}
                    {expired && <Badge tone="warm">Expirado</Badge>}
                  </p>
                  <p className="font-mono text-xs text-muted">{t.tokenPrefix}… · {t.scopes.join(", ")}</p>
                  <p className="font-mono text-[11px] text-muted">
                    Creado {fmtDateTime(t.createdAt, app.tz)} · {t.lastUsedAt ? `último uso ${fmtDateTime(t.lastUsedAt, app.tz)}` : "sin usar"}
                    {t.expiresAt ? ` · expira ${fmtDateTime(t.expiresAt, app.tz)}` : ""}
                  </p>
                </div>
                {!revoked && (
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => setRotate(t)}>
                      <RotateCw className="size-3.5" aria-hidden /> Rotar
                    </Button>
                    <Button variant="ghost" size="sm" className="text-danger! hover:text-danger!" onClick={() => setRevoke(t)}>
                      <ShieldOff className="size-3.5" aria-hidden /> Revocar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={creating} onClose={() => setCreating(false)} title="Nuevo token de API" size="sm">
        {creating && <TokenForm onCreated={(token, name) => { setCreating(false); setShown({ token, name }); app.bump(); }} onClose={() => setCreating(false)} />}
      </Dialog>
      <TokenReveal shown={shown} onClose={() => setShown(null)} />
      <ConfirmDialog open={!!rotate} title="¿Rotar token?" description={rotate ? `«${rotate.name}»: se generará uno nuevo y el actual dejará de funcionar. Actualiza a Eddie con el valor nuevo.` : undefined} confirmLabel="Rotar" danger loading={busy} onConfirm={() => void doRotate()} onClose={() => setRotate(null)} />
      <ConfirmDialog open={!!revoke} title="¿Revocar token?" description={revoke ? `«${revoke.name}» dejará de funcionar de inmediato. No se puede deshacer.` : undefined} confirmLabel="Revocar" danger loading={busy} onConfirm={() => void doRevoke()} onClose={() => setRevoke(null)} />
    </Section>
  );
}

function TokenForm({ onCreated, onClose }: { onCreated: (token: string, name: string) => void; onClose: () => void }) {
  const app = useApp();
  const [name, setName] = useState("Eddie");
  const [expires, setExpires] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setError(null);
    if (!name.trim()) return setError("Pon un nombre al token");
    setSaving(true);
    try {
      const r = await apiFetch<{ token: string; record: TokenDto }>("/api/v1/tokens", {
        method: "POST",
        body: { name: name.trim(), scopes: ["*"], expiresAt: expires ? zonedToIso(expires, "23:59", app.tz) : null },
      });
      onCreated(r.data.token, r.data.record.name);
    } catch (e) {
      setError(errMsg(e));
      setSaving(false);
    }
  }
  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Field label="Nombre">{(p) => <Input {...p} autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="Expira (opcional)" hint="Vacío = no expira.">{(p) => <DatePicker {...p} value={expires} onChange={(e) => setExpires(e.target.value)} />}</Field>
      {error && <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button type="submit" variant="primary" loading={saving}>Crear token</Button>
      </div>
    </form>
  );
}

function TokenReveal({ shown, onClose }: { shown: { token: string; name: string } | null; onClose: () => void }) {
  return (
    <Dialog open={!!shown} onClose={onClose} title="Copia tu token ahora" description="No volverá a mostrarse." dismissible={false} size="md">
      {shown && <RevealBody shown={shown} onClose={onClose} />}
    </Dialog>
  );
}
function RevealBody({ shown, onClose }: { shown: { token: string; name: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(shown.token);
    } catch {
      const el = document.getElementById("token-value");
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
        document.execCommand("copy");
      }
    }
    setCopied(true);
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Token «{shown.name}». Guárdalo en un lugar seguro: úsalo como <code className="font-mono text-fg">Authorization: Bearer …</code>.</p>
      <code id="token-value" data-testid="token-value" className="block rounded-control border border-accent/40 bg-surface-2 p-3 font-mono text-sm break-all select-all">{shown.token}</code>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => void copy()}>
          {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copiado" : "Copiar"}
        </Button>
        <Button variant="primary" onClick={onClose} disabled={!copied}>
          Ya lo guardé
        </Button>
      </div>
      {!copied && <p className="text-right text-xs text-muted">Copia el token para poder cerrar este aviso.</p>}
    </div>
  );
}

function ApiStatus() {
  const q = useApiQuery<HealthDto>("/api/v1/health");
  const app = useApp();
  const h = q.data;
  return (
    <Section id="s-api" icon={<Activity />} title="Estado de la API" description="Datos de /api/v1/health.">
      {q.loading ? (
        <Skeleton className="h-20" />
      ) : !h ? (
        <ErrorState message={q.error?.message ?? "Sin respuesta"} onRetry={q.reload} />
      ) : (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {[
            ["Estado", <Badge key="s" tone={h.status === "ok" ? "success" : "danger"}>{h.status}</Badge>],
            ["Base de datos", <Badge key="d" tone={h.database === "up" ? "success" : "danger"}>{h.database}</Badge>],
            ["Versión", <span key="v" className="font-mono">{h.version}</span>],
            ["Hora del servidor", <span key="t" className="font-mono text-xs">{fmtDateTime(h.serverTime, app.tz)}</span>],
            ["Telegram (servidor)", <Badge key="tg" tone={h.integrations.telegram ? "success" : "warm"}>{h.integrations.telegram ? "configurado" : "sin configurar"}</Badge>],
            ["Email (servidor)", <Badge key="em" tone={h.integrations.email ? "success" : "warm"}>{h.integrations.email ? "configurado" : "sin configurar"}</Badge>],
          ].map(([k, v], i) => (
            <div key={i} className="rounded-control border border-line px-3 py-2">
              <dt className="t-label">{k}</dt>
              <dd className="mt-1">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={q.reload}><RotateCw className="size-3.5" aria-hidden /> Comprobar de nuevo</Button>
        <Link href="/docs" target="_blank" rel="noopener" className={buttonClass("outline", "sm")}>
          Documentación de la API <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Section>
  );
}
