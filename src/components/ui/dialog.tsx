"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

interface BaseProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Clase de ancho máximo (dialog). */
  size?: "sm" | "md" | "lg";
  /** Evita cerrar por clic fuera/Esc (p. ej. token que se muestra una vez). */
  dismissible?: boolean;
  variant?: "dialog" | "sheet";
}

const widths = { sm: "w-[min(420px,calc(100vw-24px))]", md: "w-[min(560px,calc(100vw-24px))]", lg: "w-[min(760px,calc(100vw-24px))]" };

/** Diálogo accesible sobre <dialog> nativo: foco atrapado, Esc, fondo inerte, foco devuelto al cerrar. */
export function Dialog(props: BaseProps) {
  return props.open ? <DialogInner {...props} /> : null;
}

function DialogInner({ onClose, title, description, children, footer, size = "md", dismissible = true, variant = "dialog" }: BaseProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    if (!el.open) el.showModal();
    return () => {
      if (prev && document.contains(prev)) prev.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cn(
        "ui-dialog flex flex-col text-left",
        variant === "sheet" ? "ui-sheet" : cn("rounded-panel shadow-hud max-md:max-h-[100dvh]", widths[size]),
      )}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onMouseDown={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="t-h2 truncate">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-0.5 text-sm text-muted">
              {description}
            </p>
          )}
        </div>
        {dismissible && (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">{footer}</footer>}
    </dialog>
  );
}

export function Sheet(props: Omit<BaseProps, "variant" | "size">) {
  return <Dialog {...props} variant="sheet" />;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  danger,
  loading,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
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
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? <span className="sr-only">{description}</span>}
    </Dialog>
  );
}
