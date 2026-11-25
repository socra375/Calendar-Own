import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Bloque de formulario de las pantallas de acceso (eyebrow, título serif, subtítulo y contenido). */
export function AuthCard({
  title,
  subtitle,
  eyebrow = "Acceso",
  children,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children: ReactNode;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const header = (
    <header className="space-y-2">
      <p className="t-label">{eyebrow}</p>
      <h1 className="t-h1">{title}</h1>
      {subtitle && <p className="text-[0.9375rem] text-muted">{subtitle}</p>}
    </header>
  );
  const cls = "w-full space-y-6 [animation:rise-in_0.4s_var(--ease)_0.1s_both]";
  return onSubmit ? (
    <form onSubmit={onSubmit} className={cls} noValidate>
      {header}
      {children}
    </form>
  ) : (
    <div className={cls}>
      {header}
      {children}
    </div>
  );
}

export const authLinkClass = cn(
  "inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-accent underline-offset-4 transition-colors duration-200 hover:text-accent-hover hover:underline",
);

/** Banner de error accesible (se anuncia al aparecer). */
export function AuthAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" aria-live="assertive" className="rounded-control border border-danger/30 bg-danger/10 px-3.5 py-3 text-sm text-danger [animation:rise-in_0.2s_var(--ease)]">
      {children}
    </p>
  );
}
