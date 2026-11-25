"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
  /** Muestra una marca de selección (para opciones tipo radio). */
  checked?: boolean;
}

/** Menú desplegable accesible (role=menu, flechas, Esc, clic fuera). */
export function Menu({
  trigger,
  triggerClass,
  label,
  items,
  align = "right",
  side = "down",
  header,
}: {
  trigger: ReactNode;
  triggerClass: string;
  label: string;
  items: MenuItem[];
  align?: "left" | "right";
  side?: "up" | "down";
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function onKey(e: KeyboardEvent) {
    const els = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      setOpen(false);
      btn.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === "Tab") setOpen(false);
  }

  const itemClass = (danger?: boolean) =>
    cn(
      "flex min-h-11 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-sm transition-colors duration-150 md:min-h-9",
      danger ? "text-danger hover:bg-danger/10" : "hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
    );

  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={label} onClick={() => setOpen((o) => !o)} className={triggerClass}>
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className={cn(
            "absolute z-50 min-w-52 rounded-card border border-line bg-surface p-1.5 shadow-[var(--sh-pop)] [animation:rise-in_0.16s_var(--ease)]",
            side === "up" ? "bottom-full mb-2" : "mt-2",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {header}
          {items.map((it) =>
            it.href ? (
              <Link key={it.label} role="menuitem" href={it.href} onClick={() => setOpen(false)} className={itemClass(it.danger)}>
                {it.icon}
                {it.label}
              </Link>
            ) : (
              <button
                key={it.label}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  btn.current?.focus();
                  it.onSelect?.();
                }}
                className={itemClass(it.danger)}
              >
                {it.icon}
                <span className="flex-1">{it.label}</span>
                {it.checked && <span aria-hidden className="text-accent">●</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
