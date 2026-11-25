import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand";
import { ThemeSwitch } from "@/components/ui/theme-switch";
import { MonthArt, WeekArt } from "./auth-art";

/**
 * Marco de las pantallas de acceso: dos columnas en escritorio (panel editorial + formulario);
 * en móvil/tablet el panel se reduce a una cabecera compacta. El selector de tema vive en la esquina.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="relative grid min-h-dvh grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:grid-rows-1">
      <div className="absolute top-4 right-4 z-10 lg:top-7 lg:right-8">
        <ThemeSwitch />
      </div>

      <aside className="relative overflow-hidden border-b border-line bg-surface-2/70 px-5 pt-4 pb-5 sm:px-8 lg:flex lg:flex-col lg:justify-between lg:border-r lg:border-b-0 lg:px-14 lg:py-12 xl:px-20">
        <div className="flex min-h-11 items-center gap-2.5 sm:gap-3">
          <BrandMark priority className="size-10 sm:size-12 lg:size-16" />
          <span className="font-serif text-[1.125rem] leading-none tracking-tight sm:text-[1.5rem] lg:text-[2rem]">Personal Calendar</span>
        </div>

        <div className="mt-6 lg:my-10 lg:mt-0 xl:my-12">
          <p className="t-label mb-3 hidden lg:block">Eventos · Tareas · Fechas especiales</p>
          <p className="t-display max-w-[14ch] text-balance lg:max-w-[12ch]">
            Ordena tu tiempo, <em className="text-accent">con calma.</em>
          </p>
          <p className="mt-3 hidden max-w-md text-[1.0625rem] leading-relaxed text-muted lg:block">
            Un lugar sereno para lo que importa: tu agenda, tus pendientes y las fechas que no quieres olvidar.
          </p>
          <WeekArt className="mt-5 h-auto w-full max-w-[340px] lg:hidden" />
        </div>

        <MonthArt className="hidden h-auto w-full max-w-[380px] lg:block" />
      </aside>

      <div className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-14">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </main>
  );
}
