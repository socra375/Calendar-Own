# Personal Calendar

Calendario personal (Next.js App Router + PostgreSQL + Drizzle) con UI de propietario y API REST para el agente Eddie.
Contrato técnico: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Requisitos
Node 22+, pnpm 10+, PostgreSQL 16 (local) o Neon.

## Instalación
```bash
pnpm install
cp .env.example .env.local   # completa DATABASE_URL, AUTH_SECRET, OWNER_EMAIL, OWNER_PASSWORD…
createdb calendar && createdb calendar_test
pnpm db:migrate              # aplica drizzle/*.sql
pnpm db:seed                 # propietario + settings + categorías + festivos (idempotente)
pnpm dev                     # http://localhost:3000
```

Cambios de esquema: edita `src/server/db/schema.ts` → `pnpm db:generate` → `pnpm db:migrate`.

## Tests
```bash
pnpm test               # unit + integration
pnpm test:unit          # dominio puro (sin BD)
pnpm test:integration   # PG real: usa TEST_DATABASE_URL (def. postgres://postgres@localhost:5432/calendar_test)
```
Los tests de integración migran la BD de test y la vacían entre casos. Helpers en `tests/helpers/`.

## Calidad
`pnpm typecheck && pnpm lint && pnpm build`

## Notificaciones y cron de recordatorios

`GET|POST /api/cron/reminders` (solo `Authorization: Bearer $CRON_SECRET`, sin sesión; sin `CRON_SECRET` responde 503)
materializa los disparos de recordatorios (eventos, incluidas series recurrentes, tareas y fechas especiales) en
`[ahora-6h, ahora+24h]`, los envía y reintenta con backoff 1/5/15/60 min (5 intentos y pasa a `failed`). Disparos de más
de 6 h se cancelan sin enviar, y se cancelan los pendientes de eventos cancelados/borrados/movidos, ocurrencias
canceladas y tareas completadas. Es idempotente y seguro en paralelo. Respuesta:
`{ materialized, claimed, sent, failed, retried, cancelled, durationMs }`.
Un canal sin credenciales deja la notificación en `failed` con `last_error = CHANNEL_NOT_CONFIGURED…` (visible en
`GET /api/v1/notifications?status=failed`); nunca se simula un envío. Prueba un canal con `POST /api/v1/notifications/test`
(`{"channel":"internal|telegram|email"}`).

| Variable | Uso |
|---|---|
| `CRON_SECRET` | Bearer que autoriza el cron (obligatoria; `openssl rand -base64 32`) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram. El chat de `user_settings.telegram_chat_id` tiene prioridad |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email vía Resend. `EMAIL_FROM` debe ser un remitente de un dominio verificado |
| `NOTIFICATION_EMAIL_TO` | Destino por defecto; `user_settings.notification_email` tiene prioridad |

**Telegram**: habla con [@BotFather](https://t.me/BotFather) → `/newbot` → copia el token a `TELEGRAM_BOT_TOKEN`. Escribe
cualquier mensaje a tu bot y abre `https://api.telegram.org/bot<TOKEN>/getUpdates`: el `chat.id` es tu `TELEGRAM_CHAT_ID`.
**Resend**: crea cuenta en resend.com, verifica un dominio, crea una API key (`RESEND_API_KEY`) y usa un remitente de ese
dominio en `EMAIL_FROM` (p. ej. `Agenda <agenda@tudominio.com>`).

**Frecuencia del cron**: `vercel.json` programa un cron **diario** (`0 12 * * *` UTC) porque el plan Hobby de Vercel
rechaza expresiones que se ejecuten más de una vez al día (el despliegue falla). Ese cron diario es solo un respaldo.
Para recordatorios puntuales ("5 minutos antes") hace falta una ejecución frecuente:
- **Gratis**: el workflow `.github/workflows/reminders-cron.yml` (GitHub Actions cada 5 min; pueden retrasarse unos
  minutos). Define los secrets del repo `APP_URL` y `CRON_SECRET`. También sirve cron-job.org con
  `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/reminders`.
- **Vercel Pro**: cambia el schedule de `vercel.json` a `*/5 * * * *`.

Recordatorios por defecto: `applyDefaultReminders(tx, userId, { type, id })` (`src/server/notifications/defaults.ts`)
copia `user_settings.default_reminders` a `reminders` (idempotente). Se aplica **dentro de la misma transacción** que crea
el destino:
- `POST /events` y `POST /tasks`: si el body **no** trae `reminders` se aplican los defaults; si trae `reminders`
  (incluso `[]`) se respeta tal cual y **no** se aplican defaults (la UI precarga los defaults en el formulario y los envía
  explícitos, por lo que no se duplican).
- `POST /special-dates`: la API no acepta `reminders`, así que siempre se aplican los defaults.
- `POST /events/:id/duplicate` copia los recordatorios actuales del original, no los defaults.
Fechas especiales: el disparo se calcula desde las `work_day_start` (08:00 por defecto) del día, en la zona del usuario.

Las ocurrencias que notifica el procesador salen de la misma expansión que el calendario
(`src/server/notifications/occurrences.ts` es una capa fina sobre `domain/recurrence.ts`): excepciones movidas/canceladas,
`status: cancelled`, COUNT/UNTIL y día completo coinciden con lo que se ve en pantalla. Una RRULE inválida se registra
(sin datos sensibles) y se omite ese evento sin detener el ciclo.

`GET /api/v1/notifications` devuelve `meta.unreadCount`: notificaciones sin leer del canal `internal` (la campana), un
único COUNT independiente de los filtros. `POST /notifications/test` tiene su propio límite (10/min) con contador
separado del límite general (120/min).

Logs de error: `src/server/safe-log.ts` (`safeErrorLog`) registra solo nombre, mensaje truncado sin los `params:` de las
consultas SQL y el código (p. ej. SQLSTATE); nunca el objeto de error crudo.

## Recuperar contraseña

Flujo por correo (Resend) para el propietario; el esquema ya es multiusuario.

1. En `/login` → "¿Olvidaste tu contraseña?" → `/forgot-password` (`POST /api/auth/forgot-password {email}`). Responde **siempre 200**
   con el mismo mensaje exista o no el correo (sin enumeración de usuarios; el envío se desacopla de la respuesta con `after()`).
2. Si la cuenta existe se genera un token de 32 bytes aleatorios (base64url). En BD solo se guarda su **sha256**
   (`password_reset_tokens`); el correo (`users.email`, no `user_settings`) lleva `${APP_URL}/reset-password?token=...`.
3. `/reset-password?token=...` (`POST /api/auth/reset-password {token, password}`): contraseña de 12 a 128 caracteres. El token se
   quita de la URL al leerlo y las páginas envían `Referrer-Policy: no-referrer`. Tras cambiarla redirige a `/login`.

Reglas: el enlace **caduca en 1 hora** y es de **un solo uso**; pedir uno nuevo invalida los anteriores; un reset correcto
**cierra todas las sesiones** del usuario. Límites: solicitar 3/hora por email+IP y 10/hora por IP (429 `RATE_LIMITED`);
canjear 10 cada 15 min por IP. Token inexistente/caducado/usado → 400 `INVALID_OR_EXPIRED_TOKEN` (mensaje genérico).
Auditoría (sin token ni contraseña): `auth.password_reset_requested|completed|failed|email_failed`.

Variables necesarias: `APP_URL` (base del enlace), `RESEND_API_KEY` y `EMAIL_FROM` (remitente de un dominio verificado en Resend).
Si falta alguna **no se envía ni se simula nada**: la respuesta sigue siendo la genérica y queda `auth.password_reset_email_failed`
en el historial con el motivo (`CHANNEL_NOT_CONFIGURED` o `APP_URL_NOT_CONFIGURED`), sin secretos.

### Plan B: script de emergencia (sin correo)
```bash
DATABASE_URL=postgres://... pnpm auth:reset-password owner@example.com          # pide la contraseña sin eco (y la repite)
DATABASE_URL=postgres://... NEW_PASSWORD='nueva-contraseña-larga' pnpm auth:reset-password owner@example.com
echo 'nueva-contraseña-larga' | DATABASE_URL=postgres://... pnpm auth:reset-password owner@example.com
```
Aplica la misma política (12–128), guarda el hash argon2id, destruye todas las sesiones, invalida enlaces pendientes y audita
`auth.password_reset_completed` con actor `system` (`changes.via = "cli"`). Prefiere stdin o el prompt: `NEW_PASSWORD` queda en el
historial/entorno de la shell.

## Despliegue
(Se documentará más adelante.)
