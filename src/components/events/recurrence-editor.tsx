"use client";

import { Repeat } from "lucide-react";
import { cn } from "@/lib/cn";
import { DatePicker } from "@/components/ui/pickers";
import { Field, Input, Select } from "@/components/ui/field";
import { CUSTOM_PRESETS, WEEKDAY_LABELS, describeRec, type RecForm } from "./recurrence";

const UNITS = { daily: "día(s)", weekly: "semana(s)", monthly: "mes(es)", yearly: "año(s)" } as const;

export function RecurrenceEditor({ value, onChange, disabled }: { value: RecForm; onChange: (v: RecForm) => void; disabled?: boolean }) {
  const set = (p: Partial<RecForm>) => onChange({ ...value, ...p });
  return (
    <fieldset className="space-y-3 rounded-card border border-line p-3" disabled={disabled}>
      <legend className="t-label flex items-center gap-1.5 px-1">
        <Repeat className="size-3" aria-hidden /> Repetición
      </legend>
      <Field label="Frecuencia">
        {(p) => (
          <Select {...p} value={value.freq} onChange={(e) => set({ freq: e.target.value as RecForm["freq"] })}>
            <option value="none">No se repite</option>
            <option value="daily">Diaria</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensual</option>
            <option value="yearly">Anual</option>
            <option value="custom">Personalizada (regla RRULE)</option>
          </Select>
        )}
      </Field>

      {value.freq !== "none" && value.freq !== "custom" && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Cada</span>
          <Input
            type="number"
            min={1}
            max={999}
            aria-label="Intervalo"
            className="w-20"
            value={value.interval}
            onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
          />
          <span className="text-muted">{UNITS[value.freq]}</span>
        </div>
      )}

      {value.freq === "weekly" && (
        <div role="group" aria-label="Días de la semana" className="flex flex-wrap gap-1.5">
          {WEEKDAY_LABELS.map((d) => {
            const on = value.byDay.includes(d.code);
            return (
              <button
                key={d.code}
                type="button"
                aria-pressed={on}
                aria-label={d.long}
                title={d.long}
                onClick={() => set({ byDay: on ? value.byDay.filter((x) => x !== d.code) : [...value.byDay, d.code] })}
                className={cn(
                  "size-11 rounded-full border font-mono text-xs transition md:size-9",
                  on ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:border-accent hover:text-accent",
                )}
              >
                {d.short}
              </button>
            );
          })}
          <p className="basis-full text-xs text-muted">Sin selección: se usa el día de la semana del inicio.</p>
        </div>
      )}

      {value.freq === "custom" && (
        <div className="space-y-2">
          <Field label="Regla RRULE" hint="Sin DTSTART. Ej.: FREQ=MONTHLY;BYDAY=1MO. El fin se define abajo.">
            {(p) => <Input {...p} className="font-mono" value={value.rrule} onChange={(e) => set({ rrule: e.target.value })} placeholder="FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH" />}
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {CUSTOM_PRESETS.map((pr) => (
              <button key={pr.rrule} type="button" onClick={() => set({ rrule: pr.rrule })} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:border-accent hover:text-accent">
                {pr.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {value.freq !== "none" && (
        <div className="space-y-2">
          <Field label="Termina">
            {(p) => (
              <Select {...p} value={value.end} onChange={(e) => set({ end: e.target.value as RecForm["end"] })}>
                <option value="never">Nunca</option>
                <option value="until">En una fecha</option>
                <option value="count">Después de N repeticiones</option>
              </Select>
            )}
          </Field>
          {value.end === "until" && (
            <Field label="Última fecha (inclusive)">
              {(p) => <DatePicker {...p} value={value.until} onChange={(e) => set({ until: e.target.value })} required />}
            </Field>
          )}
          {value.end === "count" && (
            <Field label="Repeticiones">
              {(p) => <Input {...p} type="number" min={1} max={1000} value={value.count} onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })} />}
            </Field>
          )}
          <p className="text-xs text-muted" aria-live="polite">
            {describeRec(value)}
          </p>
        </div>
      )}
    </fieldset>
  );
}
