"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabDef {
  id: string;
  label: string;
  icon?: ReactNode;
}

export function Tabs({ tabs, value, onChange, label, className }: { tabs: TabDef[]; value: string; onChange: (id: string) => void; label: string; className?: string }) {
  const base = useId();
  function onKey(e: KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === value);
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[n]!.id);
    document.getElementById(`${base}-${tabs[n]!.id}`)?.focus();
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className={cn("flex gap-1 overflow-x-auto rounded-control border border-line bg-surface-2/70 p-1", className)}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            id={`${base}-${t.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex h-11 shrink-0 items-center gap-2 rounded-[8px] px-3 text-[13px] font-semibold transition-[color,background-color,box-shadow] duration-200 ease-[var(--ease)] md:h-8",
              active ? "bg-surface text-fg shadow-soft ring-1 ring-line" : "text-muted hover:bg-surface/60 hover:text-fg",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
