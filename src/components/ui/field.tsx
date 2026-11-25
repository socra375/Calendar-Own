"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const controlClass =
  "w-full rounded-control border border-line bg-surface-2/60 px-3 text-sm text-fg placeholder:text-muted/70 transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 aria-[invalid=true]:border-danger";

/** Etiqueta + control + ayuda/error con ids enlazados. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
  children: (p: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const id = useId();
  const dId = `${id}-d`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="t-label block">
        {label}
      </label>
      {children({ id, "aria-describedby": hint || error ? dId : undefined, "aria-invalid": error ? true : undefined })}
      {(error || hint) && (
        <p id={dId} role={error ? "alert" : undefined} className={cn("text-xs", error ? "text-danger" : "text-muted")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, "h-11 md:h-10", className)} {...p} />;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, "min-h-24 py-2.5", className)} {...p} />;
}
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlClass, "h-11 appearance-none bg-no-repeat pr-8 md:h-10", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a9496' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundPosition: "right 12px center" }} {...p}>
      {children}
    </select>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium">
          {label}
        </label>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-150 before:absolute before:-inset-3 before:content-[''] disabled:opacity-50",
          checked ? "border-accent bg-accent" : "border-line-strong bg-surface-2 hover:border-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4.5 rounded-full transition-transform duration-150",
            checked ? "translate-x-5 bg-accent-ink" : "bg-muted",
          )}
        />
      </button>
    </div>
  );
}
