"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { useMounted } from "@/lib/use-pref";

export type ThemeChoice = "light" | "dark" | "system";

const OPTIONS: { id: ThemeChoice; label: string; aria: string; icon: LucideIcon }[] = [
  { id: "light", label: "Claro", aria: "Tema claro", icon: Sun },
  { id: "dark", label: "Oscuro", aria: "Tema oscuro", icon: Moon },
  { id: "system", label: "Sistema", aria: "Tema del sistema", icon: Monitor },
];

/** Aplica el tema con una transición suave de colores (la clase solo vive mientras dura). */
export function useThemeChoice(onSelect?: (t: ThemeChoice) => void) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = (mounted ? (theme as ThemeChoice | undefined) : undefined) ?? null;
  function choose(t: ThemeChoice) {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    window.setTimeout(() => root.classList.remove("theme-anim"), 400);
    setTheme(t);
    onSelect?.(t);
  }
  return { current, choose };
}

/**
 * Selector de tema de tres segmentos (Claro / Oscuro / Sistema) con semántica de radiogroup:
 * flechas para moverse, tabulador entra/sale. `labeled` muestra el texto junto al icono.
 */
export function ThemeSwitch({ onSelect, labeled, className }: { onSelect?: (t: ThemeChoice) => void; labeled?: boolean; className?: string }) {
  const { current, choose } = useThemeChoice(onSelect);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent) {
    const i = OPTIONS.findIndex((o) => o.id === current);
    let n: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = ((i < 0 ? -1 : i) + 1) % OPTIONS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = ((i < 0 ? 0 : i) - 1 + OPTIONS.length) % OPTIONS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = OPTIONS.length - 1;
    else return;
    e.preventDefault();
    choose(OPTIONS[n]!.id);
    refs.current[n]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      onKeyDown={onKey}
      className={cn("items-center gap-0.5 border border-line bg-surface-2/70", labeled ? "grid w-full grid-cols-3 rounded-control p-1" : "inline-flex rounded-full p-0.5", className)}
    >
      {OPTIONS.map((o, i) => {
        const on = current === o.id;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.aria}
            title={o.aria}
            tabIndex={on || (!current && i === 0) ? 0 : -1}
            onClick={() => choose(o.id)}
            className={cn(
              "inline-flex items-center justify-center gap-2 text-[13px] font-semibold transition-[color,background-color,box-shadow] duration-200 ease-[var(--ease)]",
              labeled ? "h-11 rounded-[8px] md:h-9" : "size-11 rounded-full md:size-8",
              on ? "bg-surface text-accent shadow-soft ring-1 ring-line" : "text-muted hover:text-fg",
            )}
          >
            <o.icon className="size-4" aria-hidden />
            {labeled && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
