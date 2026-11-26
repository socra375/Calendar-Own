"use client";

import { Eye, EyeOff } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Input } from "./field";

/** Input de contraseña con botón mostrar/ocultar (el estado `visible` lo controla el formulario). */
export function PasswordInput({
  visible,
  onToggle,
  className,
  ...p
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { visible: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      <Input {...p} type={visible ? "text" : "password"} className={cn("pr-12", className)} />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-control text-muted transition-colors duration-150 hover:text-fg focus-visible:text-fg"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
