import type { ReactNode } from "react";

/** Contenedor común de las pantallas de acceso (marca, título y subtítulo). */
export function AuthCard({
  title,
  subtitle,
  children,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const header = (
    <div className="space-y-3">
      <span className="grid size-10 place-items-center rounded-[10px] border border-line-strong bg-surface-2">
        <span className="pulse-dot size-2 rounded-full bg-accent" />
      </span>
      <div>
        <p className="t-label">Eddie · HUD</p>
        <h1 className="t-h2">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
    </div>
  );
  const cls = "reticle w-full max-w-sm space-y-5 rounded-panel border border-line bg-surface p-7 shadow-hud";
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

export const authLinkClass =
  "inline-flex min-h-11 items-center rounded-sm text-sm text-accent underline-offset-4 transition-colors duration-150 hover:underline";
