import { AlertTriangle, RotateCw } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export function Panel({
  reticle,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { reticle?: boolean }) {
  return (
    <section
      className={cn("rounded-card border border-line bg-surface p-4 md:p-5", reticle && "reticle rounded-panel shadow-hud", className)}
      {...rest}
    >
      {children}
    </section>
  );
}
export const Card = Panel;

export function PanelHeader({ title, action, label }: { title: string; action?: ReactNode; label?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        {label && <p className="t-label">{label}</p>}
        <h2 className="truncate text-base font-semibold">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton h-4 w-full", className)} />;
}
export function SkeletonList({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <div className="text-muted [&>svg]:size-8">{icon}</div>}
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card border border-danger/40 bg-danger/5 px-6 py-8 text-center">
      <AlertTriangle className="size-7 text-danger" aria-hidden />
      <div>
        <p className="font-medium">No se pudo cargar</p>
        <p className="mt-1 text-sm text-muted">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw className="size-3.5" aria-hidden /> Reintentar
        </Button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="t-h1">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
