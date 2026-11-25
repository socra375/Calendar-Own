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

**Frecuencia del cron**: `vercel.json` programa `*/5 * * * *`, pero **el plan Hobby de Vercel solo admite crons diarios**
(el despliegue falla o se ejecuta una vez al día). Opciones: Vercel Pro, o quitar el cron de `vercel.json` y usar el
workflow `.github/workflows/reminders-cron.yml` (GitHub Actions cada 5 min; los crons de Actions pueden retrasarse unos
minutos). Define los secrets del repo `APP_URL` y `CRON_SECRET`. También sirve cron-job.org con
`curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/reminders`.

Recordatorios por defecto: `applyDefaultReminders(tx, userId, { type, id })` (`src/server/notifications/defaults.ts`)
copia `user_settings.default_reminders` a `reminders` al crear un evento/tarea/fecha especial (idempotente).
Fechas especiales: el disparo se calcula desde las `work_day_start` (08:00 por defecto) del día, en la zona del usuario.

## Despliegue
(Se documentará más adelante.)
