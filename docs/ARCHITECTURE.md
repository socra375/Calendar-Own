# Personal Calendar — Arquitectura (contrato de implementación)

Este documento es la fuente de verdad. Todo agente/desarrollador lo sigue; si algo debe cambiar, se cambia aquí primero.

## 1. Análisis

- Tipo: monolito web (Next.js) con UI de propietario + API REST para un cliente máquina (Eddie).
- Cuellos de botella probables: (1) expansión de recurrencias en rangos amplios, (2) zonas horarias / día completo, (3) idempotencia del procesador de recordatorios en serverless, (4) rate limiting sin memoria compartida (serverless).
- Carga real: 1 usuario + 1 agente. El rendimiento no es crítico; la corrección sí.

## 2. Stack (decisiones)

| Capa | Elección | Por qué / alternativa descartada |
|---|---|---|
| Lenguaje | TypeScript estricto | Tipos compartidos UI/API/DB. Go/Rust no aportan con esta carga. |
| Framework | Next.js (App Router, última estable) + React 19 | Requisito. Route Handlers = API REST. |
| Estilos | Tailwind CSS v4 | Requisito. |
| Calendario | FullCalendar (react, daygrid, timegrid, list, interaction, rrule no) | Requisito. La expansión RRULE se hace en servidor, FullCalendar recibe ocurrencias ya calculadas. |
| BD | PostgreSQL (Neon en prod, PG16 local para dev/tests) | Requisito. |
| Driver | `pg` + `drizzle-orm/node-postgres` | Funciona igual contra Neon (URL pooled) y PG local → tests reales. |
| ORM | Drizzle + drizzle-kit (migraciones SQL versionadas) | Requisito. |
| Validación | Zod v4 | Requisito. `z.toJSONSchema` nativo → OpenAPI sin librería extra. |
| Recurrencia | `rrule` | Estándar RFC 5545. |
| Fechas/TZ | `date-fns` + `@date-fns/tz` | Mínimo necesario para TZ correctas. |
| Hash contraseña | `@node-rs/argon2` (argon2id) | Más fuerte que bcrypt. |
| Email | `resend` SDK | Requisito. |
| Telegram | `fetch` a Bot API | Sin dependencia. |
| Tests | Vitest contra PG real | Sin mocks de BD. |
| Iconos | `lucide-react` | Consistentes. |
| Tema | `next-themes` | Claro/oscuro sin parpadeo. |
| Fuentes | `geist` (local, sin red en build) | |
| Package manager | pnpm | |

No usar: NextAuth/Auth.js (auth propia más simple para 1 propietario + tokens), Redis/Upstash (rate limit en Postgres), librerías de OpenAPI (se genera desde Zod).

## 3. Arquitectura: monolito modular por capas

```
Route Handler / Page  →  validación (Zod)  →  service (lógica de dominio)  →  repository/db (Drizzle)
                                   ↘ audit log, conflicts, recurrence (módulos puros)
```

Reglas:
- La UI NUNCA accede a la BD directamente. La UI (client components) consume `/api/v1/*` con cookie de sesión. Server components pueden llamar a services en servidor (nunca exponen credenciales).
- Un solo camino de lógica: UI y Eddie usan los mismos services y los mismos endpoints.
- Toda query filtra por `userId` (preparado para multiusuario).
- Módulos puros y testeables sin BD: `recurrence`, `availability`, `time`.

### Estructura de carpetas

```
src/
  app/
    (auth)/login/page.tsx
    (app)/layout.tsx                 # sidebar + topbar, requiere sesión
    (app)/dashboard|calendar|agenda|tasks|special-dates|categories|notifications|history|settings/page.tsx
    docs/page.tsx                    # Swagger UI (CDN) sobre /api/v1/openapi.json
    api/
      auth/login|logout|me/route.ts
      cron/reminders/route.ts
      v1/<recurso>/route.ts, v1/<recurso>/[id]/route.ts, ...
  components/{ui,layout,calendar,events,tasks,special-dates,categories,dashboard,settings}/
  lib/                               # código seguro para cliente
    api-client.ts                    # fetch tipado al envelope
    validation/<recurso>.ts          # schemas Zod compartidos (input/output)
    constants.ts
  server/                            # solo servidor (import 'server-only')
    db/{client.ts,schema.ts,migrate.ts,seed.ts}
    auth/{password.ts,session.ts,tokens.ts,actor.ts}
    http/{handler.ts,response.ts,errors.ts,rate-limit.ts,cors.ts}
    services/<recurso>.service.ts
    domain/{recurrence.ts,availability.ts,time.ts,conflicts.ts}
    notifications/{processor.ts,channels/telegram.ts,channels/email.ts,channels/internal.ts}
    audit/audit.service.ts
    openapi/{registry.ts,paths/*.ts}
drizzle/                             # migraciones generadas
tests/{unit,integration}/
docs/
```

## 4. Esquema de base de datos

Convenciones: PK `uuid` (`gen_random_uuid()`), `created_at`/`updated_at timestamptz not null default now()`, borrado suave `deleted_at timestamptz null` en events, tasks, categories, special_dates. FK a `users` con `on delete cascade`. Índices en `(user_id, ...)` de consultas frecuentes.

- **users**: id, email (unique, lower), name, password_hash, timestamps.
- **sessions** (añadida: necesaria para sesiones seguras): id, user_id, token_hash (unique, sha256), expires_at, last_seen_at, ip, user_agent, created_at.
- **rate_limits** (añadida: rate limit/fuerza bruta en serverless): key text, window_start timestamptz, count int, PK(key, window_start).
- **user_settings**: user_id PK, display_name, timezone (default `America/Santo_Domingo`), theme enum(light,dark,system), week_starts_on smallint, work_day_start time (08:00), work_day_end time (18:00), work_days smallint[] ({1..5}), default_reminders jsonb `[{offsetMinutes, channel}]`, telegram_enabled, telegram_chat_id, email_enabled, notification_email, updated_at.
- **categories**: id, user_id, name, description, color, icon, is_active, timestamps, deleted_at. Unique (user_id, lower(name)) where deleted_at is null.
- **tags**: id, user_id, name, color, created_at. Unique (user_id, lower(name)).
- **events**: id, user_id, title, description, notes, is_all_day, start_at/end_at timestamptz (timed), start_date/end_date date (día completo; end_date EXCLUSIVO), timezone text, category_id (set null), color, location, meeting_url, meeting_provider enum(google_meet,zoom,teams,other), status enum(confirmed,tentative,cancelled), is_blocking bool, source enum(ui,eddie,system), timestamps, deleted_at. CHECK: si all_day → dates not null y end_date > start_date; si no → timestamps not null y end_at >= start_at. Índices (user_id, start_at), (user_id, start_date).
- **event_recurrence**: event_id PK/FK cascade, rrule text (solo la parte RRULE, sin DTSTART; DTSTART = inicio del evento en su timezone), series_end_at timestamptz null (derivado de UNTIL/COUNT para podar consultas; null = infinita), timestamps.
- **event_exceptions**: id, event_id FK cascade, occurrence_key text (ISO instant UTC para timed, `YYYY-MM-DD` para all-day), kind enum(cancelled,modified), overrides jsonb (subconjunto validado por Zod: title, description, start/end, location, status, notes, meeting_url, color), timestamps. Unique(event_id, occurrence_key).
- **event_tags** / **task_tags**: PK compuesta, cascade.
- **tasks**: id, user_id, title, description, due_at timestamptz null, priority enum(low,medium,high,urgent), status enum(pending,in_progress,completed,cancelled), category_id, event_id (set null), completed_at, source, timestamps, deleted_at.
- **special_dates**: id, user_id, title, type enum(birthday,holiday,celebration,anniversary,personal), date date (para anuales: año de origen), recurs_yearly bool, color, icon, description, timestamps, deleted_at. 29-feb en años no bisiestos → 28-feb.
- **reminders** (configuración): id, user_id, target_type enum(event,task,special_date), event_id/task_id/special_date_id (exactamente uno no nulo, CHECK), offset_minutes int ≥ 0 (minutos ANTES), channel enum(internal,telegram,email), is_active, timestamps.
- **notifications** (entregas + bandeja interna): id, user_id, reminder_id (set null), channel, target_type, target_id uuid, occurrence_key, scheduled_for timestamptz, status enum(pending,processing,sent,failed,cancelled), attempts int, next_attempt_at, last_error, sent_at, title, body, read_at, timestamps. **Unique(reminder_id, occurrence_key)** = anti-duplicados.
- **api_tokens**: id, user_id, name, token_prefix (primeros 12 chars, visible), token_hash (unique sha256), scopes text[] default {'*'}, last_used_at, expires_at, revoked_at, rotated_from_id, created_at.
- **audit_logs**: id, user_id, actor_type enum(user,eddie,system), api_token_id, action text (`event.create`…), resource_type, resource_id, request_id, result enum(success,failure), changes jsonb (redactado), ip, user_agent, created_at. Índices (user_id, created_at desc), (resource_type, resource_id), (action).

Tiempo: instantes en `timestamptz` (UTC). Día completo en `date` local. La TZ del usuario (`user_settings.timezone`) se usa para: DTSTART de recurrencias, límites de “hoy/mañana/semana”, horario laboral.

## 5. Recurrencia

- Serie = fila en `events` + `event_recurrence`. Nunca se materializan ocurrencias en BD.
- `expandOccurrences(event, recurrence, exceptions, rangeStart, rangeEnd, tz)` (puro): calcula en hora local de la TZ del evento (DTSTART flotante → convertido a UTC con `@date-fns/tz`, así DST/offset son correctos), aplica exceptions (cancelled se omite, modified aplica overrides), devuelve `Occurrence { id: eventId, occurrenceKey, seriesId, isRecurring, isException, start, end, isAllDay, ...campos }`.
- Edición por alcance (`scope`): `all` → actualiza la serie; `this` → upsert exception modified/cancelled; `following` → cierra la serie original con UNTIL antes de la ocurrencia y crea una serie nueva desde ella (copia tags/reminders).
- Frecuencias UI: daily, weekly (días), monthly, yearly, custom (RRULE libre validado), fin por fecha (UNTIL) o COUNT.

## 6. Disponibilidad y conflictos

- Ocupado = ocurrencias no canceladas y no borradas. Eventos de día completo NO ocupan salvo `is_blocking = true` (ocupan el día local completo).
- `findConflicts(candidate)` → lista de solapamientos. Por defecto: advertencia en respuesta (`meta.conflicts`). Si alguno es `is_blocking` → 409 `BLOCKING_CONFLICT`, salvo `force: true` en el body.
- `GET /availability?from&to` → `{ busy: [{start,end,eventIds}] (fusionados), events: [...] }`.
- `GET /availability/free-slots?from&to&durationMinutes&withinWorkingHours=true` → `{ slots: [{start,end,durationMinutes}] }`, recortados al horario laboral del usuario si se pide.

## 7. API REST

Base `/api/v1`. JSON. Envelope SIEMPRE:

```json
{ "success": true, "data": {}, "error": null, "message": "OK", "pagination": { "page": 1, "pageSize": 50, "total": 120, "totalPages": 3 }, "meta": { "requestId": "…", "conflicts": [] } }
```
Error: `success:false, data:null, error:{ code:"VALIDATION_ERROR", details }, message`. Códigos: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT/BLOCKING_CONFLICT 409, CONFIRMATION_REQUIRED 428, RATE_LIMITED 429, INTERNAL_ERROR 500.

Autenticación (`src/server/http/handler.ts` → `apiHandler({ auth, query, body, params }, fn)`):
- `Authorization: Bearer pc_<token>` → token Eddie (sha256 lookup, no revocado/expirado) → actor `{type:'eddie'}`.
- Cookie `pc_session` (httpOnly, Secure, SameSite=Lax) → actor `{type:'user'}`. En métodos mutantes con cookie: verificar `Origin` = `APP_URL` (CSRF).
- `auth: 'public'` solo para `/health` y `/openapi.json`.
- Rate limit: por token/IP (p. ej. 120 req/min), login 5 intentos / 15 min por email+IP.
- Cada request tiene `requestId` (header `X-Request-Id`), usado en audit_logs.
- Mutaciones → audit log automático vía service (`actor`, acción, recurso, resultado, cambios redactados).

Endpoints: los del requerimiento, más:
- `POST /events/:id/duplicate`, `POST /{events|tasks|categories|special-dates}/:id/restore`
- `PATCH|DELETE /events/:id?scope=all|this|following&occurrenceKey=…`
- `DELETE /events?ids=a,b` (borrado masivo) exige header `X-Confirm-Bulk: true` → si no, 428. Máx 100.
- `GET|POST /tags`, `PATCH|DELETE /tags/:id`
- `GET|PATCH /settings`, `GET|POST /tokens`, `POST /tokens/:id/rotate`, `DELETE /tokens/:id` (solo sesión, nunca token)
- `GET /audit-logs?from&to&action&resourceType&actorType&q`
- `GET /notifications`, `PATCH /notifications/:id` (marcar leída), `POST /notifications/test` (probar canal)
- `GET /openapi.json` + página `/docs`.
- `/api/auth/login|logout|me`, `/api/cron/reminders` (Bearer `CRON_SECRET`).

Filtros comunes de listado: `page`, `pageSize` (≤100), `q`, `categoryId`, `tag`, `status`, `from`, `to`, `sort`.

## 8. Notificaciones (procesamiento programado)

`/api/cron/reminders` (idempotente, seguro de ejecutar en paralelo):
1. **Materializar**: para cada reminder activo, calcular disparos `trigger = occurrenceStart - offset` en `[now - 6h, now + 24h]` → `INSERT … ON CONFLICT (reminder_id, occurrence_key) DO NOTHING`.
2. **Reclamar**: `UPDATE notifications SET status='processing' WHERE id IN (SELECT … WHERE status='pending' AND scheduled_for<=now AND next_attempt_at<=now FOR UPDATE SKIP LOCKED LIMIT 50) RETURNING *`. Recuperar `processing` > 10 min.
3. **Enviar** por canal. Éxito → sent/sent_at. Fallo → attempts+1, backoff exponencial (1,5,15,60 min), tras 5 → failed.
4. Disparos muy viejos (> 6h) no se envían (se marcan cancelled) para no spamear tras caída.
Canal sin credenciales → `failed` con error `CHANNEL_NOT_CONFIGURED` (visible en UI), nunca simulado.

## 9. Seguridad

argon2id; sesiones con token aleatorio 32B (solo hash en BD), expiración 30 días deslizante; tokens Eddie `pc_` + 32B base64url, se muestran UNA vez; revocar/rotar; redacción de `password`, `token`, `authorization` en logs; CORS por `CORS_ALLOWED_ORIGINS` (vacío = sin CORS; Eddie es servidor-a-servidor); headers de seguridad en `next.config`; secretos solo en `process.env` de servidor (`server-only`).

## 10. Variables de entorno

`DATABASE_URL, AUTH_SECRET, APP_URL, CRON_SECRET, EDDIE_API_TOKEN_HASH (opcional: bootstrap de un token por hash), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, RESEND_API_KEY, EMAIL_FROM, NOTIFICATION_EMAIL_TO, CORS_ALLOWED_ORIGINS, OWNER_EMAIL, OWNER_PASSWORD (solo seed), DEFAULT_TIMEZONE`.

## 11. Riesgos técnicos

1. **Vercel Cron en plan Hobby solo ejecuta 1 vez al día** → recordatorios de "5 min antes" no funcionan sin plan Pro o un cron externo (cron-job.org / GitHub Actions cada 5 min llamando a `/api/cron/reminders` con `CRON_SECRET`). Ambos documentados.
2. DST: República Dominicana no tiene DST, pero el código no lo asume.
3. FullCalendar + React 19: verificar compatibilidad de versión.
4. Neon cold start (~0.5–1 s) en la primera request.
5. Telegram/Resend requieren credenciales del usuario; sin ellas los canales fallan de forma explícita.
