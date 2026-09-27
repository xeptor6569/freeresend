# CLAUDE.md

Guidance for AI coding agents working in this repository.

## Project Overview

FreeResend is a self-hosted, Resend-compatible email API that sends through Amazon SES, with optional DigitalOcean DNS automation. This fork is deployed only as a Docker Compose stack (app + Postgres + optional Caddy HTTPS proxy). There is no Kubernetes, Vercel, Supabase, or hosted marketing site; do not reintroduce them.

**Key Technologies:**
- Next.js 15 (App Router, `output: 'standalone'`)
- TypeScript
- PostgreSQL via `pg` (connection pool in `src/lib/database.ts`)
- Amazon SES and IAM SDK v3
- DigitalOcean API (axios)
- JWT sessions (`jsonwebtoken`) and bcryptjs

## Commands

```bash
# Deployment
./setup.sh                      # or: powershell -ExecutionPolicy Bypass -File .\setup.ps1
docker compose up -d --build
docker compose logs -f app

# Development
npm run dev
npm run build
npm run lint
npx tsc --noEmit
npm test

# End-to-end smoke tests (need a verified domain and API key)
FRS_API_KEY=frs_... FROM_EMAIL=... TO_EMAIL=... node test-email.js
FRS_API_KEY=frs_... FROM_EMAIL=... TO_EMAIL=... ./test-curl.sh
```

## Architecture

- **API routes**: `src/app/api/` (each route currently does its own auth and CORS inline)
- **Business logic**: `src/lib/`
- **Dashboard UI**: `src/app/page.tsx` renders `LoginForm` or `Dashboard`; tabs live in `src/components/`
- **Startup**: `src/instrumentation.ts` calls `src/lib/bootstrap.ts`, which validates env vars, waits for Postgres, applies `database.sql`, and creates/updates the admin user from `ADMIN_EMAIL`/`ADMIN_PASSWORD`. The process exits if startup fails.

### Database

- Schema lives in `database.sql` and is applied on every startup inside a transaction guarded by an advisory lock. Every statement must be idempotent (`CREATE ... IF NOT EXISTS`, `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`). Target Postgres 13+.
- Tables: `users`, `domains`, `api_keys`, `email_logs`, `webhook_events`.
- JSONB columns come back from `pg` as parsed values; do not `JSON.parse` them.
- Connection: `DATABASE_URL`, or `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` (used by docker-compose). `DATABASE_SSL=true` enables SSL without certificate verification.

```typescript
import { query, transaction } from "@/lib/database";

const result = await query("SELECT * FROM users WHERE id = $1", [userId]);

await transaction(async (client) => {
  // multiple statements
});
```

### Authentication

- Dashboard: `POST /api/auth/login` returns a JWT signed with `JWT_SECRET`; the client stores it in localStorage and sends `Authorization: Bearer <jwt>`.
- API: keys look like `frs_{keyId}_{secret}`, stored bcrypt-hashed with a prefix, scoped to one verified domain.

### Integrations

- `src/lib/ses.ts`: domain verification, DKIM, configuration sets, sending (raw MIME when there are attachments).
- `src/lib/smtp.ts`: per-domain IAM users for SMTP credentials (needs extra IAM permissions).
- `src/lib/digitalocean.ts`: automatic DNS records when `DO_API_TOKEN` is set.
- `src/app/api/webhooks/ses/route.ts`: SNS endpoint. Auto-confirms subscriptions from `sns.*.amazonaws.com`, accepts both SES event-publishing (`eventType`) and identity-notification (`notificationType`) payloads.
- Dashboard tools: `EmailDnsChecker` (`POST /api/tools/email-dns-checker`, requires login) and `SesProductionRequestHelper` (client-only).

## Conventions

- Keep `POST /api/emails` request/response shapes compatible with Resend. The Resend SDK is pointed here with `RESEND_BASE_URL=https://host/api`.
- Error responses: `{ error: "message", details?: ... }`.
- New configuration must be added to `.env.example`, `docker-compose.yml` (`app.environment`), both setup scripts if it is generated, and the README configuration table.
- Never hard-code credentials, personal emails, or third-party analytics.

## Environment Variables

```bash
ADMIN_EMAIL=            # dashboard login; ADMIN_PASSWORD is re-applied on every start
ADMIN_PASSWORD=
JWT_SECRET=
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
DO_API_TOKEN=           # optional
POSTGRES_PASSWORD=      # compose only; fixed after first start
APP_PORT=3000           # compose only
APP_DOMAIN=             # compose only, for the Caddy https profile
DATABASE_URL=           # optional external Postgres
DATABASE_SSL=false
```
