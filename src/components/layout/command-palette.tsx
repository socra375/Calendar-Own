"use client";

import { CalendarDays, CheckSquare, Gift, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { fmtDateShort } from "@/lib/datetime";
import type { SearchDto } from "@/lib/types";
import { qs } from "@/lib/use-api";
import { useApp } from "./app-context";

interface Hit {
  key: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Búsqueda global" size="md">
      <Inner onClose={onClose} />
    </Dialog>
  );
}

function Inner({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ q: string; data?: SearchDto; error?: string }>({ q: "" });
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const term = q.trim();

  useEffect(() => {
    if (!term) return;
    let alive = true;
    const t = window.setTimeout(() => {
      apiFetch<SearchDto>(`/api/v1/search${qs({ q: term, limit: 8 })}`)
        .then((r) => alive && setRes({ q: term, data: r.data }))
        .catch((e: Error) => alive && setRes({ q: term, error: e.message }));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [term]);

  const data = res.q === term ? res.data : undefined;
  const loading = !!term && res.q !== term;

  const hits = useMemo<Hit[]>(() => {
    if (!data) return [];
    const go = (fn: () => void) => () => {
      onClose();
      fn();
    };
    return [
      ...data.events.map((e) => ({
        key: `e-${e.id}`,
        icon: <CalendarDays className="size-4 text-accent" aria-hidden />,
        title: e.title,
        sub: `${fmtDateShort(e.localDate)}${e.localTime ? ` · ${e.localTime}` : " · todo el día"}`,
        run: go(() => app.openEventDetail(e.id)),
      })),
      ...data.tasks.map((t) => ({
        key: `t-${t.id}`,
        icon: <CheckSquare className="size-4 text-warm" aria-hidden />,
        title: t.title,
        sub: `Tarea · ${t.status}${t.dueLocalDate ? ` · vence ${fmtDateShort(t.dueLocalDate)}` : ""}`,
        run: go(() => app.openTaskForm(t)),
      })),
      ...data.specialDates.map((s) => ({
        key: `s-${s.id}`,
        icon: <Gift className="size-4 text-accent" aria-hidden />,
        title: s.title,
        sub: `Fecha especial${s.nextOccurrence ? ` · ${fmtDateShort(s.nextOccurrence)}` : ""}`,
        run: go(() => app.openSpecialDateForm(s)),
      })),
    ];
  }, [data, app, onClose]);

  const idx = Math.min(active, Math.max(hits.length - 1, 0));

  return (
    <div className="-mx-1 space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={input}
          autoFocus
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={listId}
          aria-activedescendant={hits[idx] ? `${listId}-${idx}` : undefined}
          aria-label="Buscar eventos, tareas y fechas"
          placeholder="Buscar eventos, tareas, fechas…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && hits[idx]) {
              e.preventDefault();
              hits[idx]!.run();
            }
          }}
          className="h-11 w-full rounded-control border border-line bg-surface-2/60 pr-3 pl-9 text-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
        />
      </div>
      <div aria-live="polite" className="min-h-24">
        {!term && <p className="py-6 text-center text-sm text-muted">Escribe para buscar en tus eventos, tareas y fechas especiales.</p>}
        {loading && <p className="py-6 text-center text-sm text-muted">Buscando…</p>}
        {res.q === term && res.error && <p role="alert" className="py-6 text-center text-sm text-danger">{res.error}</p>}
        {data && hits.length === 0 && <p className="py-6 text-center text-sm text-muted">Sin resultados para «{term}».</p>}
        {hits.length > 0 && (
          <ul id={listId} role="listbox" aria-label="Resultados" className="max-h-80 space-y-1 overflow-y-auto">
            {hits.map((h, i) => (
              <li
                key={h.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === idx}
                onMouseEnter={() => setActive(i)}
                onClick={h.run}
                className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-control px-3 py-2", i === idx ? "bg-surface-2" : "hover:bg-surface-2/60")}
              >
                {h.icon}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{h.title}</span>
                  <span className="block truncate font-mono text-[11px] text-muted">{h.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
