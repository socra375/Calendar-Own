"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Kind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
}
interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);
export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("ToastProvider ausente");
  return c;
}

const icons = { success: CheckCircle2, error: XCircle, info: Info };
const tone = { success: "text-success", error: "text-danger", info: "text-accent" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const region = useRef<HTMLDivElement>(null);

  const push = useCallback((kind: Kind, message: string) => {
    const id = ++idRef.current;
    setItems((s) => [...s.slice(-3), { id, kind, message }]);
    window.setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === "error" ? 8000 : 4500);
  }, []);
  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push("success", m), error: (m) => push("error", m), info: (m) => push("info", m) }),
    [push],
  );

  // El contenedor es un popover (capa superior) para quedar por encima de <dialog> modales.
  useEffect(() => {
    const el = region.current;
    if (!el || typeof el.showPopover !== "function") return;
    try {
      if (el.matches(":popover-open")) el.hidePopover();
      if (items.length) el.showPopover();
    } catch {
      /* popover no soportado */
    }
  }, [items]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div ref={region} popover="manual" className="toast-region" aria-live="polite" aria-atomic="false">
        <ul className="flex flex-col gap-2">
          {items.map((t) => {
            const Icon = icons[t.kind];
            return (
              <li
                key={t.id}
                role={t.kind === "error" ? "alert" : "status"}
                className="flex items-start gap-3 rounded-card border border-line-strong bg-surface p-3 text-sm shadow-hud backdrop-blur [animation:toast-in_0.2s_var(--ease)]"
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", tone[t.kind])} aria-hidden />
                <span className="min-w-0 flex-1 break-words">{t.message}</span>
                <button
                  type="button"
                  onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}
                  className="-m-1 rounded p-1 text-muted hover:text-fg"
                  aria-label="Cerrar aviso"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Ctx.Provider>
  );
}
