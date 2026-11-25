# Personal Calendar — Diseño de interfaz (contrato para el agente de UI)

## Briefing (Arquitecto UX · Color/Tipografía · Interacciones)
Dirección: **"HUD sobrio"**. Superficies neutras de grafito (no azules), un solo acento teal-cian usado con disciplina (foco, hoy, hora actual, estados activos) y un acento cálido ámbar para tareas/avisos. Los detalles JARVIS son *micro*: etiquetas en mono con tracking, esquinas con marcas de retícula en paneles destacados, línea de "ahora" con pulso sutil, bordes de 1px con brillo en hover. Nada de neón saturado ni degradados azules grandes. Dark mode por defecto, light mode de primera clase.

Adaptaciones frente a la guía genérica de landing pages: no se usan imágenes de Unsplash ni placeholders (es una app de productividad con datos reales; `source.unsplash.com` además está discontinuado). El "assets" de esta app son iconos (lucide) y la propia data.

## Design tokens (Tailwind v4, `@theme` + variables CSS en `src/app/globals.css`)
Dark (`:root.dark`, default): bg `#0B0D0E`, surface `#121516`, surface-2 `#181C1D`, border `#252A2C`, border-strong `#343B3E`, text `#E8ECEC`, text-muted `#8A9496`, accent `#2DD4BF`, accent-ink `#042F2A`, warm `#F5B84B`, danger `#F26D6D`, success `#6EE7A8`.
Light (`:root`): bg `#F6F6F3`, surface `#FFFFFF`, surface-2 `#EFEFEB`, border `#E1E1DB`, border-strong `#CFCFC7`, text `#141717`, text-muted `#5E6866`, accent `#0F9488`, accent-ink `#FFFFFF`, warm `#B7791F`, danger `#C93C3C`, success `#1F8F5B`.
Radios: 10px controles, 14px tarjetas, 20px paneles. Sombras: sutiles, coloreadas con el acento al 8–12% (`0 8px 30px -12px color-mix(in oklab, var(--accent) 25%, transparent)`). Glass solo en topbar/sheets (`backdrop-blur`).
Tipografía: Geist Sans (ya instalada, `geist`), Geist Mono para etiquetas/horas/ids. Escala fluida con `clamp()`: h1 `clamp(1.5rem, 1.1rem + 1.6vw, 2.25rem)`, h2 `clamp(1.125rem, 1rem + .6vw, 1.5rem)`, cuerpo 14–15px, etiquetas mono 11px uppercase tracking .08em.
Movimiento: 150–200ms `cubic-bezier(.2,.8,.2,1)`, respetar `prefers-reduced-motion`. Todo elemento interactivo: `:hover` y `:focus-visible` (anillo 2px acento + offset), `aria-label`/roles correctos, objetivos táctiles ≥44px en móvil.
Colores de categoría/evento: el usuario los define; el texto sobre ellos se calcula por contraste (WCAG ≥4.5).

## Layout
- Desktop: sidebar fija 248px (colapsable a iconos 72px) + topbar con búsqueda global (`⌘K`), botón "Nuevo" (evento/tarea), campana con contador de no leídas, toggle de tema. Contenido en grid; dashboard tipo **bento asimétrico**.
- Móvil (<768px): sidebar → bottom tab bar (Inicio, Calendario, Agenda, Tareas, Más) + FAB "+", sheets a pantalla completa para formularios, FullCalendar en `listWeek`/`timeGridDay` por defecto, toolbar compacta.
- Dashboard (sin sobrecargar): saludo + fecha en grande, panel "Agenda de hoy" (línea de tiempo con "ahora"), "Próximos eventos", "Tareas pendientes/vencidas", "Próximos cumpleaños y fechas", mini resumen semanal (3–4 métricas), accesos rápidos.

## Pantallas (todas conectadas a /api/v1 reales; sin botones muertos)
dashboard · calendar (FullCalendar dayGrid/timeGrid/list + drag/resize→PATCH, selección de rango→crear, filtro por categoría, búsqueda, vista Agenda) · agenda · tasks · special-dates · categories (+ tags) · notifications (bandeja + estado de entregas) · history (audit logs con filtros fecha/acción/recurso/actor) · settings (apariencia, zona horaria, categorías, recordatorios por defecto, Telegram, email, tokens de Eddie con crear/rotar/revocar y mostrar-una-vez, estado de API/health, enlace a /docs).

Formularios: Evento (título, descripción, inicio/fin, día completo, categoría, color, etiquetas, ubicación, URL videollamada con proveedor detectado, notas, estado, bloqueo obligatorio, recurrencia con editor visual + alcance this/following/all al editar/borrar, recordatorios), con **advertencia de conflictos en vivo** (muestra solapamientos y permite guardar), confirmación antes de eliminar y de borrar series. Duplicar. Estados vacío/carga/error en cada vista; toasts de éxito/fallo.

## Reglas técnicas
- Client components consumen `src/lib/api-client.ts` (`apiFetch`) con cookie de sesión; nunca importan `src/server/**`. Server components pueden leer vía services pero preferir la API para una sola vía de lógica.
- Estado remoto con fetch + revalidación simple (sin añadir librerías; `package.json` no se toca salvo necesidad justificada).
- Zona horaria del usuario (`user_settings.timezone`) para mostrar/crear; FullCalendar `timeZone` = esa zona.
- Accesibilidad: landmarks, `aria-live` en toasts, foco atrapado en diálogos (`<dialog>` nativo o equivalente), navegación por teclado completa.
