import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "warm" | "danger" | "success";
const tones: Record<Tone, string> = {
  neutral: "border-line bg-surface-2/70 text-muted",
  accent: "border-accent/30 bg-accent-soft text-accent",
  warm: "border-warm/40 bg-warm/10 text-warm",
  danger: "border-danger/40 bg-danger/10 text-danger",
  success: "border-success/40 bg-success/10 text-success",
};

export function Badge({ tone = "neutral", children, className, color }: { tone?: Tone; children: ReactNode; className?: string; color?: string | null }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold leading-4 uppercase tracking-[0.08em]", tones[tone], className)}
    >
      {color && <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}
