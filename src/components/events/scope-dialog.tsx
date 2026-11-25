"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import type { Scope } from "@/components/layout/app-context";

const OPTIONS: { id: Scope; label: string; hint: string }[] = [
  { id: "this", label: "Solo este evento", hint: "Afecta únicamente a esta ocurrencia." },
  { id: "following", label: "Este y los siguientes", hint: "Divide la serie a partir de esta ocurrencia." },
  { id: "all", label: "Toda la serie", hint: "Afecta a todas las ocurrencias." },
];

/** Selector de alcance para eventos recurrentes (solo este / este y siguientes / toda la serie). */
export function ScopeDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  loading,
  allowed,
  allHint,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  allowed?: Scope[];
  /** Texto extra para «Toda la serie» (p. ej. avisar de que se descartan ocurrencias editadas). */
  allHint?: string;
  onConfirm: (s: Scope) => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<Scope>("this");
  const name = useId();
  const opts = OPTIONS.filter((o) => !allowed || allowed.includes(o.id));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={loading} onClick={() => onConfirm(scope)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="sr-only">Alcance</legend>
        {opts.map((o) => (
          <label
            key={o.id}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors hover:border-accent",
              scope === o.id ? "border-accent bg-accent/10" : "border-line",
            )}
          >
            <input type="radio" name={name} className="mt-1 accent-[var(--accent)]" checked={scope === o.id} onChange={() => setScope(o.id)} />
            <span>
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="block text-xs text-muted">{o.id === "all" && allHint ? `${o.hint} ${allHint}` : o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}
