# Personal Calendar — Diseño de interfaz (contrato para el agente de UI)

## Dirección: editorial, cálida y sobria
Identidad editorial premium: tema **claro por defecto** (crema + superficies blancas), acento **naranja** y tipografía serif para titulares. Jerarquía tipográfica clara, mucho aire, reglas de 1px (hairlines), etiquetas pequeñas en mayúsculas con tracking, radios moderados y sombras muy sutiles y cálidas. Sin azules fríos, sin glow ni degradados. Los colores de categoría/evento los define el usuario; el texto sobre ellos se calcula por contraste (`readableOn`, WCAG ≥4.5).

## Marca
Logo en `public/brand/logo-square-512.png` (fondo oscuro opaco), usado siempre como **tile** (`components/ui/brand.tsx`, `BrandMark`): contenedor `rounded-[22%]`, `overflow-hidden`, sombra cálida y `next/image` 512 px. Tamaños: 40px en sidebar/topbar, 40–48px en la cabecera móvil de login, 64px en el panel de login. Favicon/apple-touch: `src/app/icon.png` y `src/app/apple-icon.png`.

## Tokens (`src/app/globals.css`, variables CSS + `@theme inline` de Tailwind v4)
| Token | Claro (`:root`) | Oscuro (`:root.dark`) |
|---|---|---|
| bg | `#FAF6EE` | `#161412` |
| surface | `#FFFFFF` | `#1D1A17` |
| surface-2 | `#F3EDE1` | `#24201C` |
| line / line-strong | `#E8DFD0` / `#D6CAB6` | `#322D27` / `#4A443B` |
| fg | `#1F1A17` | `#F4ECDF` |
| muted | `#6B5F55` | `#A9A094` |
| accent (texto, enlaces, botones) | `#BE3F0A` (hover `#A63607`) | `#F59F5B` (hover `#FFB06F`) |
| accent-ink (texto sobre accent) | `#FFFFFF` | `#1F1208` |
| accent-bright (solo decorativo) | `#F26A1B` | `#FFA94D` |
| accent-soft | accent-bright al 10% | accent-bright al 12% |
| warm / danger / success | `#8F5A00` / `#B42318` / `#2B7A4B` | `#F0B35A` / `#F28B82` / `#7FD1A0` |

Contraste medido (WCAG): claro fg/bg 15.99, muted/bg 5.74, accent/bg 4.99, accent/surface 5.38, blanco/accent (botón) 5.38, danger/surface 6.57; oscuro fg/bg 15.67, muted/bg 7.12, accent/bg 8.74, accent-ink/accent (botón) 8.70. `accent-bright` no se usa para texto.
Radios: 10px controles, 14px tarjetas, 18px paneles destacados. Sombras: `--sh-soft` y `--sh-pop` (cálidas, muy suaves).

## Tipografía (`next/font/google` en `layout.tsx`)
- **DM Serif Display** (`font-serif`): h1/h2, saludo, nombre de app, números grandes (`.t-display`, `.t-h1`, `.t-h2`, `.t-num`).
- **Manrope** (`font-sans`): texto y UI. **DM Mono** (`font-mono`): solo horas, ids y valores técnicos.
- `.t-label`: 11px, mayúsculas, tracking .12em, peso 600. Escala fluida con `clamp()` (h1 `clamp(1.875rem, 1.4rem + 1.9vw, 2.875rem)`).

## Tema
`next-themes` (`attribute="class"`, `defaultTheme="light"`, `enableSystem`, clave `theme` en localStorage; sin parpadeo gracias al script previo a la hidratación). `ThemeSwitch` (`components/ui/theme-switch.tsx`): radiogroup de 3 segmentos Claro / Oscuro / Sistema (aria-labels "Tema claro/oscuro/del sistema", flechas de teclado). Aparece en la topbar (escritorio; en móvil es un menú de un botón), en la esquina del login y, con etiquetas, en Ajustes. En la app se persiste además vía `PATCH /api/v1/settings {theme}` (API sin cambios). La transición de colores al cambiar de tema usa la clase temporal `.theme-anim`.

## Movimiento
150–250ms, `cubic-bezier(.2,.8,.2,1)`. Hover y `:focus-visible` (anillo 2px acento + offset; inputs con anillo suave de 3px) en todo lo interactivo. Entrada de página (`#main > *`, fade + 8px), paneles con `.stagger`, diálogos/sheets/toasts/menús con fade+translate cortos, skeletons con shimmer. `prefers-reduced-motion` anula animaciones y transiciones.

## Login y recuperación (`src/app/(auth)`)
`AuthShell` en escritorio (≥1024px) dos columnas: izquierda panel editorial (logo + nombre en serif, titular "Ordena tu tiempo, con calma.", rejilla mensual SVG con dos fechas en naranja y animación de trazo/aparición); derecha formulario centrado (`AuthCard`: eyebrow, h1 serif, campos con error bajo cada uno, `PasswordInput`, botón naranja a ancho completo con estado de carga, enlace de recuperación, banner `role="alert" aria-live="assertive"`). Selector de tema en la esquina. En móvil/tablet una columna: el panel se reduce a cabecera compacta (logo, nombre, titular y tira semanal SVG). Mismo marco para `/forgot-password` y `/reset-password`.

## Layout
- Desktop: sidebar 248px (colapsable a 72px, solo tile) + topbar con búsqueda (`⌘K`), "Nuevo", campana, selector de tema y menú de usuario. Contenido centrado (máx. 1440px). Dashboard tipo bento sobrio con saludo en serif y números grandes en serif.
- Móvil (<768px): bottom tab bar (Inicio, Calendario, Agenda, Tareas, Más) + FAB "+", sheets a pantalla completa, FullCalendar en `listWeek` por defecto, objetivos táctiles ≥44px.
- Componentes base en `src/components/ui` (Button, Badge, Field/Input/Select/Switch, Panel/PageHeader/EmptyState/ErrorState/Skeleton, Tabs, Menu, Dialog/Sheet/ConfirmDialog, Toast, pickers, ThemeSwitch, BrandMark): no duplicar estilos fuera de ellos y de `globals.css` (incluye el restyling de FullCalendar: hoy en naranja suave, línea de "ahora" 1px, eventos con color del usuario).

## Pantallas (todas conectadas a /api/v1 reales; sin botones muertos)
dashboard · calendar (FullCalendar dayGrid/timeGrid/list + drag/resize→PATCH, selección de rango→crear, filtro por categoría, búsqueda, vista Agenda) · agenda · tasks · special-dates · categories (+ tags) · notifications (bandeja + estado de entregas) · history (audit logs con filtros fecha/acción/recurso/actor) · settings (apariencia, zona horaria, categorías, recordatorios por defecto, Telegram, email, tokens de Eddie con crear/rotar/revocar y mostrar-una-vez, estado de API/health, enlace a /docs).

Formularios: Evento (título, descripción, inicio/fin, día completo, categoría, color, etiquetas, ubicación, URL videollamada con proveedor detectado, notas, estado, bloqueo obligatorio, recurrencia con editor visual + alcance this/following/all al editar/borrar, recordatorios), con **advertencia de conflictos en vivo** (muestra solapamientos y permite guardar), confirmación antes de eliminar y de borrar series. Duplicar. Estados vacío/carga/error en cada vista; toasts de éxito/fallo.

## Reglas técnicas
- Client components consumen `src/lib/api-client.ts` (`apiFetch`) con cookie de sesión; nunca importan `src/server/**`. Server components pueden leer vía services pero preferir la API para una sola vía de lógica.
- Estado remoto con fetch + revalidación simple (sin añadir librerías; `package.json` no se toca salvo necesidad justificada).
- Zona horaria del usuario (`user_settings.timezone`) para mostrar/crear; FullCalendar `timeZone` = esa zona.
- Accesibilidad: landmarks, `aria-live` en toasts, foco atrapado en diálogos (`<dialog>` nativo o equivalente), navegación por teclado completa.
