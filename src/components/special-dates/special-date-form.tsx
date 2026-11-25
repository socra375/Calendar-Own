"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { ColorPicker, DatePicker, IconPicker } from "@/components/ui/pickers";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { localDate, nowMs } from "@/lib/datetime";
import type { SpecialDateDto } from "@/lib/types";
import { errMsg } from "@/lib/use-api";
import { specialDateCreateBody } from "@/lib/validation/special-dates";
import { useApp } from "@/components/layout/app-context";

export const TYPE_LABEL: Record<SpecialDateDto["type"], string> = {
  birthday: "Cumpleaños",
  holiday: "Festivo",
  celebration: "Celebración",
  anniversary: "Aniversario",
  personal: "Personal",
};
const TYPE_ICON: Record<SpecialDateDto["type"], string> = { birthday: "cake", holiday: "flag", celebration: "party-popper", anniversary: "heart", personal: "star" };

export function SpecialDateForm({ request, onClose }: { request: { sd: SpecialDateDto | null } | null; onClose: () => void }) {
  return (
    <Dialog open={!!request} onClose={onClose} title={request?.sd ? "Editar fecha especial" : "Nueva fecha especial"} size="md">
      {request && <Inner sd={request.sd} onClose={onClose} />}
    </Dialog>
  );
}

function Inner({ sd, onClose }: { sd: SpecialDateDto | null; onClose: () => void }) {
  const app = useApp();
  const toast = useToast();
  const [title, setTitle] = useState(sd?.title ?? "");
  const [type, setType] = useState<SpecialDateDto["type"]>(sd?.type ?? "birthday");
  const [date, setDate] = useState(sd?.date ?? localDate(nowMs(), app.tz));
  const [yearly, setYearly] = useState(sd?.recursYearly ?? true);
  const [color, setColor] = useState<string | null>(sd?.color ?? null);
  const [icon, setIcon] = useState<string | null>(sd?.icon ?? TYPE_ICON[sd?.type ?? "birthday"]);
  const [description, setDescription] = useState(sd?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const body = { title: title.trim(), type, date, recursYearly: yearly, color, icon, description: description.trim() || null };
    const parsed = specialDateCreateBody.safeParse(body);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
    setSaving(true);
    try {
      if (sd) await apiFetch(`/api/v1/special-dates/${sd.id}`, { method: "PATCH", body });
      else await apiFetch("/api/v1/special-dates", { method: "POST", body });
      toast.success(sd ? "Fecha actualizada" : "Fecha creada");
      app.bump();
      onClose();
    } catch (e) {
      setError(errMsg(e));
      setSaving(false);
    }
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Título">{(p) => <Input {...p} autoFocus required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cumpleaños de…" />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          {(p) => (
            <Select
              {...p}
              value={type}
              onChange={(e) => {
                const t = e.target.value as SpecialDateDto["type"];
                setType(t);
                if (!sd && (icon === null || Object.values(TYPE_ICON).includes(icon))) setIcon(TYPE_ICON[t]);
              }}
            >
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Fecha" hint={yearly ? "Año de origen (para calcular años cumplidos)" : undefined}>{(p) => <DatePicker {...p} value={date} onChange={(e) => setDate(e.target.value)} required />}</Field>
      </div>
      <Switch checked={yearly} onChange={setYearly} label="Se repite cada año" />
      <div className="space-y-1.5">
        <p className="t-label">Color</p>
        <ColorPicker value={color} onChange={setColor} allowNone />
      </div>
      <div className="space-y-1.5">
        <p className="t-label">Icono</p>
        <IconPicker value={icon} onChange={setIcon} />
      </div>
      <Field label="Descripción">{(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      {error && (
        <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {sd ? "Guardar" : "Crear fecha"}
        </Button>
      </div>
    </form>
  );
}
