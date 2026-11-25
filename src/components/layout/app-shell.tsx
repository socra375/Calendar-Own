"use client";

import {
  Bell, CalendarDays, CalendarRange, CheckSquare, ChevronsLeft, ChevronsRight, FolderTree, Gift, History, LayoutDashboard, LogOut, Moon, MoreHorizontal, Plus,
  Search, Settings, Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useMounted, usePref } from "@/lib/use-pref";
import { useApp } from "./app-context";
import { CommandPalette } from "./command-palette";

const NAV = [
  { href: "/dashboard", label: "Inicio", full: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendario", full: "Calendario", icon: CalendarDays },
  { href: "/agenda", label: "Agenda", full: "Agenda", icon: CalendarRange },
  { href: "/tasks", label: "Tareas", full: "Tareas", icon: CheckSquare },
  { href: "/special-dates", label: "Fechas", full: "Fechas especiales", icon: Gift },
  { href: "/categories", label: "Categorías", full: "Categorías y etiquetas", icon: FolderTree },
  { href: "/notifications", label: "Avisos", full: "Notificaciones", icon: Bell },
  { href: "/history", label: "Historial", full: "Historial", icon: History },
  { href: "/settings", label: "Ajustes", full: "Ajustes", icon: Settings },
] as const;
const MOBILE_TABS = NAV.slice(0, 4);
const MORE = NAV.slice(4);

function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="flex min-h-11 items-center gap-2.5 rounded-control" aria-label="Personal Calendar, ir al inicio">
      <span className="reticle grid size-11 place-items-center rounded-[10px] md:size-9 border border-line-strong bg-surface-2">
        <span className="size-2 rounded-full bg-accent pulse-dot" />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-sm font-semibold">Personal Calendar</span>
          <span className="t-label block">Eddie · HUD</span>
        </span>
      )}
    </Link>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const dark = mounted ? resolvedTheme === "dark" : true;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      onClick={() => {
        const next = dark ? "light" : "dark";
        setTheme(next);
        void apiFetch("/api/v1/settings", { method: "PATCH", body: { theme: next } }).catch(() => undefined);
      }}
    >
      {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const app = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsedPref, setCollapsed] = usePref("pc:sidebar", "0");
  const collapsed = collapsedPref === "1";
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const newItems = [
    { label: "Evento", icon: <CalendarDays className="size-4 text-accent" aria-hidden />, onSelect: () => app.openEventForm() },
    { label: "Tarea", icon: <CheckSquare className="size-4 text-warm" aria-hidden />, onSelect: () => app.openTaskForm() },
    { label: "Fecha especial", icon: <Gift className="size-4 text-accent" aria-hidden />, onSelect: () => app.openSpecialDateForm() },
  ];
  const initial = (app.user.name || app.user.email).slice(0, 1).toUpperCase();

  return (
    <div className={cn("min-h-dvh transition-[padding] duration-200", collapsed ? "md:pl-[72px]" : "md:pl-[248px]")}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-control focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">
        Saltar al contenido
      </a>

      {/* Sidebar (desktop) */}
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface transition-[width] duration-200 md:flex", collapsed ? "w-[72px]" : "w-[248px]")}>
        <div className={cn("flex h-16 items-center border-b border-line", collapsed ? "justify-center" : "px-4")}>
          <Logo compact={collapsed} />
        </div>
        <nav aria-label="Principal" className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((n) => {
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? n.full : undefined}
                className={cn(
                  "group relative flex h-10 items-center gap-3 rounded-control px-3 text-sm transition-colors duration-150",
                  collapsed && "justify-center px-0",
                  active ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {active && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-accent" />}
                <n.icon className="size-[18px] shrink-0" aria-hidden />
                {collapsed ? <span className="sr-only">{n.full}</span> : <span className="truncate">{n.full}</span>}
                {n.href === "/notifications" && app.unread > 0 && (
                  <span className={cn("ml-auto rounded-full bg-accent px-1.5 font-mono text-[10px] text-accent-ink", collapsed && "absolute top-1 right-2 ml-0")}>{app.unread > 99 ? "99+" : app.unread}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <Button variant="ghost" size="sm" className={cn("w-full", collapsed ? "justify-center px-0" : "justify-start")} onClick={() => setCollapsed(collapsed ? "0" : "1")} aria-label={collapsed ? "Expandir menú lateral" : "Contraer menú lateral"} aria-pressed={collapsed}>
            {collapsed ? <ChevronsRight className="size-4" aria-hidden /> : <><ChevronsLeft className="size-4" aria-hidden /> Contraer</>}
          </Button>
        </div>
      </aside>

      {/* Topbar */}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-md md:px-8">
        <div className="md:hidden">
          <Logo compact />
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Buscar (⌘K)"
          aria-keyshortcuts="Control+K Meta+K"
          className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-control border border-line bg-surface px-3 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg md:h-10 md:max-w-md"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="flex-1 truncate text-left">Buscar…</span>
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 font-mono text-[10px] md:block">⌘K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden md:block">
            <Menu label="Crear nuevo" triggerClass={buttonClass("primary", "md")} trigger={<><Plus className="size-4" aria-hidden /> Nuevo</>} items={newItems} />
          </div>
          <Link href="/notifications" aria-label={app.unread ? `Notificaciones, ${app.unread} sin leer` : "Notificaciones"} className={cn(buttonClass("ghost", "icon"), "relative")}>
            <Bell className="size-4" aria-hidden />
            {app.unread > 0 && <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[10px] leading-4 text-accent-ink">{app.unread > 99 ? "99+" : app.unread}</span>}
          </Link>
          <ThemeToggle />
          <Menu
            label="Menú de usuario"
            triggerClass="grid size-11 place-items-center rounded-full border border-line-strong bg-surface-2 font-mono text-sm transition-colors hover:border-accent md:size-9"
            trigger={<span aria-hidden>{initial}</span>}
            header={
              <div className="border-b border-line px-2.5 pt-1.5 pb-2.5 mb-1.5">
                <p className="truncate text-sm font-medium">{app.user.name}</p>
                <p className="truncate font-mono text-[11px] text-muted">{app.user.email}</p>
              </div>
            }
            items={[
              { label: "Ajustes", icon: <Settings className="size-4" aria-hidden />, href: "/settings" },
              { label: "Cerrar sesión", icon: <LogOut className="size-4" aria-hidden />, onSelect: () => void logout(), danger: true },
            ]}
          />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="px-4 py-6 pb-32 outline-none md:px-8 md:py-8 md:pb-10">
        {children}
      </main>

      {/* Bottom tab bar + FAB (móvil) */}
      <nav aria-label="Navegación móvil" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <ul className="grid grid-cols-5">
          {MOBILE_TABS.map((n) => {
            const active = isActive(n.href);
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? "page" : undefined} className={cn("flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors", active ? "text-accent" : "text-muted hover:text-fg")}>
                  <n.icon className="size-5" aria-hidden />
                  {n.label}
                </Link>
              </li>
            );
          })}
          <li className="relative">
            <Menu
              label="Más secciones"
              align="right"
              side="up"
              triggerClass={cn("flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] transition-colors", MORE.some((m) => isActive(m.href)) ? "text-accent" : "text-muted hover:text-fg")}
              trigger={<><MoreHorizontal className="size-5" aria-hidden />Más</>}
              items={MORE.map((m) => ({ label: m.full, href: m.href, icon: <m.icon className="size-4" aria-hidden /> }))}
            />
          </li>
        </ul>
      </nav>
      <div className="fixed right-4 bottom-[88px] z-30 md:hidden">
        <Menu label="Crear nuevo" side="up" triggerClass="grid size-14 place-items-center rounded-full bg-accent text-accent-ink shadow-hud transition-[filter,transform] hover:brightness-110 active:scale-95" trigger={<Plus className="size-6" aria-hidden />} items={newItems} />
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
