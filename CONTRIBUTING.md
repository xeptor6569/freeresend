# Contributing

## Local setup

```sh
npm install
docker compose up -d postgres   # add ports: ["5432:5432"] to the postgres service first
npm run dev
```

Create `.env.local` with `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and your AWS SES keys. On startup the app applies `database.sql` and creates the admin user, so there is no separate migration step.

## Before opening a pull request

```sh
npm run lint
npx tsc --noEmit
npm test
```

For changes that touch sending, also run `test-email.js` against a verified domain (see README.md).

## Guidelines

- Keep `POST /api/emails` compatible with the Resend API and SDK.
- Use the helpers in `src/lib/database.ts` with parameterized queries.
- Schema changes go in `database.sql` and must be safe to re-run on every startup (`IF NOT EXISTS`, `DROP ... IF EXISTS` before `CREATE`).
- Never commit credentials. Test scripts read everything from environment variables.
