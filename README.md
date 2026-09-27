# FreeResend

A self-hosted, Resend-compatible email API that sends through Amazon SES. It ships as a Docker Compose stack: the app, a Postgres database, and an optional HTTPS proxy.

This is a fork of [eibrahim/freeresend](https://github.com/eibrahim/freeresend) with the hosted-service marketing site, Kubernetes manifests, and Supabase leftovers removed.

## What you need

- Docker with Docker Compose v2 (Docker Desktop on Windows/macOS, or Docker Engine on Linux)
- An AWS account with SES enabled, and an IAM user's access key (see [AWS permissions](#aws-permissions))
- A domain you can add DNS records to

## Quick start

1. Create the `.env` file. The setup script asks for your admin email and AWS keys, and generates the database password, JWT secret, and admin password.

   Windows (PowerShell):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\setup.ps1
   ```

   Linux / macOS:

   ```sh
   sh setup.sh
   ```

   Prefer to do it by hand? Copy `.env.example` to `.env` and fill in every empty value in the first four sections.

2. Start the stack:

   ```sh
   docker compose up -d --build
   ```

   The first build takes a few minutes. On startup the app waits for Postgres, creates or updates the database tables, and creates the admin user from `.env`.

3. Open <http://localhost:3000> and sign in with the admin email and password printed by the setup script.

Check that everything is running:

```sh
docker compose ps
docker compose logs -f app
curl http://localhost:3000/api/health
```

## Sending your first email

1. **Domains tab**: add your sending domain. FreeResend registers it with SES and shows the DNS records to create: SES verification TXT, three DKIM CNAMEs, SPF, DMARC, and MX. If `DO_API_TOKEN` is set and the domain's DNS is hosted on DigitalOcean, the records are created for you.
2. Wait for DNS to propagate (usually 5 to 30 minutes), then click **Check Verification**. The **DNS Check** tab shows what public DNS currently returns.
3. **API Keys tab**: create a key for the verified domain. Copy the full key (`frs_...`) from the success message; it is only shown once.
4. Send:

   ```sh
   curl -X POST http://localhost:3000/api/emails \
     -H "Authorization: Bearer frs_your_key" \
     -H "Content-Type: application/json" \
     -d '{"from":"hello@yourdomain.com","to":["you@example.com"],"subject":"Hello","html":"<p>It works</p>"}'
   ```

New AWS accounts are in the **SES sandbox**: you can only send to addresses you have verified in the SES console. The **SES Access** tab drafts the production access request to send to AWS.

### Using the Resend SDK

Point the official [Resend Node.js SDK](https://github.com/resend/resend-node) at your server with an environment variable and use your FreeResend key:

```sh
RESEND_BASE_URL=https://mail.yourdomain.com/api
```

```js
import { Resend } from "resend";

const resend = new Resend("frs_your_key");
await resend.emails.send({
  from: "hello@yourdomain.com",
  to: ["you@example.com"],
  subject: "Hello",
  html: "<p>It works</p>",
});
```

## Configuration

All settings live in `.env`. After editing it, run `docker compose up -d` to apply them.

| Variable | Required | Notes |
| --- | --- | --- |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Yes | Dashboard login. Changing `ADMIN_PASSWORD` and restarting resets the password. |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Yes | SES credentials. The app starts without them, but domains and sending will fail. |
| `JWT_SECRET` | Yes | Signs dashboard sessions. Changing it signs everyone out. |
| `POSTGRES_PASSWORD` | Yes | Set once. Postgres keeps the original password in its data volume, so changing it later breaks the connection. |
| `DO_API_TOKEN` | No | DigitalOcean token with read/write access to domains, for automatic DNS records. |
| `APP_PORT` | No | Host port, default `3000`. Use `127.0.0.1:3000` to only allow access through the HTTPS proxy. |
| `APP_DOMAIN` | No | Public hostname for the HTTPS proxy. |
| `DATABASE_URL`, `DATABASE_SSL` | No | Use an external Postgres instead of the bundled one. |

## HTTPS and public access

To use FreeResend from other servers, and to receive SES bounce and complaint notifications, it needs a public HTTPS address. The stack includes an optional [Caddy](https://caddyserver.com/) proxy that gets a Let's Encrypt certificate automatically.

1. Point a DNS A/AAAA record (for example `mail.yourdomain.com`) at the server, and open ports 80 and 443.
2. In `.env`, set `APP_DOMAIN=mail.yourdomain.com` and `APP_PORT=127.0.0.1:3000`.
3. Start with the `https` profile:

   ```sh
   docker compose --profile https up -d
   ```

Already running a reverse proxy (Traefik, nginx, Caddy)? Skip the profile and proxy to port 3000.

### Bounce and complaint webhooks

Delivery, bounce, and complaint events update the status in the Email Logs tab. They reach FreeResend through Amazon SNS:

1. In the SNS console, create a Standard topic in the same region as SES.
2. Add a subscription to the topic with protocol **HTTPS** and endpoint `https://mail.yourdomain.com/api/webhooks/ses`. FreeResend confirms the subscription automatically.
3. In the SES console, open **Identities**, then your domain, then the **Notifications** tab. Set that topic for bounce, complaint, and delivery feedback.

## Operations

**Update to a newer version**

```sh
git pull
docker compose up -d --build
```

Schema changes are applied automatically on startup.

**Back up and restore the database**

```sh
docker compose exec -T postgres pg_dump -U freeresend freeresend > backup.sql
docker compose exec -T postgres psql -U freeresend freeresend < backup.sql
```

**Stop, or delete everything**

```sh
docker compose down        # stop; data is kept in the postgres_data volume
docker compose down -v     # stop and delete all data, including logs and API keys
```

**Use an external Postgres** (Postgres 13 or newer)

Set `DATABASE_URL=postgresql://user:password@host:5432/dbname` in `.env`, plus `DATABASE_SSL=true` if the provider requires SSL. URL-encode special characters in the password. Then start only the app:

```sh
docker compose up -d --no-deps app
```

## AWS permissions

The IAM user needs these SES actions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:VerifyDomainIdentity",
        "ses:GetIdentityVerificationAttributes",
        "ses:DeleteIdentity",
        "ses:CreateConfigurationSet",
        "ses:VerifyDomainDkim",
        "ses:GetIdentityDkimAttributes"
      ],
      "Resource": "*"
    }
  ]
}
```

The optional **SMTP credentials** feature on the Domains tab creates a dedicated IAM user per domain. That also requires `iam:CreateUser`, `iam:DeleteUser`, `iam:CreateAccessKey`, `iam:DeleteAccessKey`, `iam:ListAccessKeys`, `iam:AttachUserPolicy`, and `iam:DetachUserPolicy`. Leave these out if you only use the HTTP API.

## API reference

Emails (API key auth, `Authorization: Bearer frs_...`):

- `POST /api/emails` - send an email (Resend-compatible)
- `GET /api/emails/logs` - list sent emails (also accepts a dashboard session)

Dashboard (session auth from `POST /api/auth/login`):

- `GET /api/auth/me`
- `GET /api/emails/{id}` - one email with its delivery events
- `GET|POST /api/domains`, `GET|DELETE /api/domains/{id}`
- `POST /api/domains/{id}/verify`, `POST /api/domains/{id}/retry-dns`
- `POST|DELETE /api/domains/{id}/smtp`
- `GET|POST /api/api-keys`, `PUT|DELETE /api/api-keys/{id}`
- `POST /api/tools/email-dns-checker`

Other:

- `GET /api/health` - returns 503 when the database is unreachable
- `POST /api/webhooks/ses` - SNS notifications from SES

## Troubleshooting

**`docker compose up` fails with "POSTGRES_PASSWORD is not set"**: there is no `.env` next to `docker-compose.yml`. Run the setup script.

**The app container keeps restarting**: run `docker compose logs app`. The first error line names the missing setting or the database problem.

**"password authentication failed" after editing `.env`**: `POSTGRES_PASSWORD` changed after the database was created. Put the old value back, or run `docker compose down -v` to start over (deletes all data).

**Forgot the admin password**: set a new `ADMIN_PASSWORD` in `.env` and run `docker compose up -d`.

**Domain stuck on pending**: check the records with the **DNS Check** tab, or `dig TXT _amazonses.yourdomain.com`. Propagation can take up to an hour.

**"Invalid API key"**: use the complete key from the creation message (`frs_<id>_<secret>`), not the masked value in the table.

**Emails only reach some recipients**: your SES account is still in the sandbox.

## Development

```sh
npm install
docker compose up -d postgres        # or point DATABASE_URL at any Postgres
npm run dev
```

For `npm run dev`, put the settings in `.env.local`: `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, the AWS keys, and `DATABASE_URL`. The bundled Postgres port is not published by default. To use it from the host, add `ports: ["5432:5432"]` to the `postgres` service.

```sh
npm run lint
npm test
FRS_API_KEY=frs_... FROM_EMAIL=hello@yourdomain.com TO_EMAIL=you@example.com node test-email.js
```

## License

MIT. See [LICENSE](LICENSE). Originally created by [Emad Ibrahim](https://github.com/eibrahim/freeresend).
