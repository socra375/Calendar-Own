import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink border-transparent hover:brightness-110 active:brightness-95",
  secondary: "bg-surface-2 text-fg border-line hover:border-line-strong hover:bg-surface-2/70",
  outline: "bg-transparent text-fg border-line-strong hover:border-accent hover:text-accent",
  ghost: "bg-transparent text-muted border-transparent hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger text-white border-transparent hover:brightness-110 dark:text-[#2a0a0a]",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-11 px-3 text-[13px] md:h-8",
  md: "h-11 px-4 text-sm md:h-10",
  icon: "size-11 md:size-9 justify-center",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string) {
  return cn(
    "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-control border font-medium transition-[background-color,border-color,color,filter] duration-150 select-none disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    extra,
  );
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({ variant, size, loading, className, children, disabled, type = "button", ...rest }: Props) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
