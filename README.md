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

## Cron de recordatorios
`vercel.json` programa `/api/cron/reminders` cada 5 min. **El plan Hobby de Vercel solo permite crons diarios**: para
recordatorios puntuales usa Vercel Pro o un cron externo (cron-job.org / GitHub Actions cada 5 min) llamando a
`/api/cron/reminders` con `Authorization: Bearer $CRON_SECRET`.

## Despliegue
(Se documentará más adelante.)
