"use client";

import { X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { PALETTE } from "@/lib/color";
import { Badge } from "./badge";
import { controlClass } from "./field";
import { ICONS, DynIcon } from "./icons";

export function ColorPicker({ value, onChange, label = "Color", allowNone }: { value: string | null; onChange: (v: string | null) => void; label?: string; allowNone?: boolean }) {
  const customId = useId();
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {allowNone && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          aria-label="Sin color"
          className={cn(
            "grid size-8 place-items-center rounded-full border border-dashed border-line-strong text-muted transition hover:border-accent md:size-7",
            value === null && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
          )}
        >
          <X className="size-3" aria-hidden />
        </button>
      )}
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-pressed={value?.toLowerCase() === c}
          aria-label={`Color ${c}`}
          className={cn(
            "size-8 rounded-full border border-black/10 transition hover:scale-110 md:size-7",
            value?.toLowerCase() === c && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
          )}
          style={{ background: c }}
        />
      ))}
      <label htmlFor={customId} className="sr-only">
        Color personalizado
      </label>
      <input
        id={customId}
        type="color"
        value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#e8590c"}
        onChange={(e) => onChange(e.target.value)}
        className="size-8 cursor-pointer rounded-full md:size-7"
        title="Color personalizado"
      />
    </div>
  );
}

export function IconPicker({ value, onChange, label = "Icono" }: { value: string | null; onChange: (v: string | null) => void; label?: string }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
      {Object.keys(ICONS).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(value === k ? null : k)}
          aria-pressed={value === k}
          aria-label={k}
          title={k}
          className={cn(
            "grid size-11 place-items-center rounded-control border border-line text-muted transition hover:border-accent hover:text-accent md:size-9",
            value === k && "border-accent bg-accent/10 text-accent",
          )}
        >
          <DynIcon name={k} className="size-4" />
        </button>
      ))}
    </div>
  );
}

export function TagInput({ value, onChange, suggestions = [], label = "Etiquetas" }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; label?: string }) {
  const [text, setText] = useState("");
  const listId = useId();
  const inputId = useId();
  function add(raw: string) {
    const t = raw.trim().slice(0, 50);
    if (!t || value.some((v) => v.toLowerCase() === t.toLowerCase())) return setText("");
    onChange([...value, t]);
    setText("");
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(text);
    } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
  }
  return (
    <div className={cn(controlClass, "flex min-h-11 flex-wrap items-center gap-1.5 py-1.5 focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20 md:min-h-10")}>
      {value.map((t) => (
        <Badge key={t} tone="accent" className="gap-1.5 normal-case tracking-normal">
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Quitar etiqueta ${t}`} className="-mr-1 rounded-full p-0.5 hover:bg-accent/20">
            <X className="size-3" aria-hidden />
          </button>
        </Badge>
      ))}
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        id={inputId}
        list={listId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => text && add(text)}
        placeholder={value.length ? "" : "Añadir etiqueta y Enter"}
        className="min-w-24 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted/70"
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !value.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

import type { InputHTMLAttributes } from "react";
export function DatePicker({ className, ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <input type="date" className={cn(controlClass, "h-11 md:h-10", className)} {...p} />;
}
export function TimePicker({ className, ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <input type="time" step={300} className={cn(controlClass, "h-11 md:h-10", className)} {...p} />;
}
