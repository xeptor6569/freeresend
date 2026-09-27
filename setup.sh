#!/bin/sh
# Creates .env for the Docker Compose stack with generated secrets.
set -eu
cd "$(dirname "$0")"

if [ -e .env ]; then
  echo ".env already exists. Edit it directly, or delete it and run this script again."
  exit 1
fi

secret() { od -An -tx1 -N"$1" /dev/urandom | tr -d ' \n'; }

ask() {
  if [ -n "${2:-}" ]; then printf '%s [%s]: ' "$1" "$2" >&2; else printf '%s: ' "$1" >&2; fi
  answer=""
  read -r answer || true
  echo "${answer:-${2:-}}"
}

ADMIN_EMAIL=""
while [ -z "$ADMIN_EMAIL" ]; do ADMIN_EMAIL=$(ask "Admin email (dashboard login)"); done
AWS_REGION=$(ask "AWS region" "us-east-1")
AWS_ACCESS_KEY_ID=$(ask "AWS access key ID (Enter to fill in later)")
AWS_SECRET_ACCESS_KEY=$(ask "AWS secret access key (Enter to fill in later)")
DO_API_TOKEN=$(ask "DigitalOcean API token (optional)")
ADMIN_PASSWORD=$(secret 12)
JWT_SECRET=$(secret 48)
POSTGRES_PASSWORD=$(secret 24)

KEYS="ADMIN_EMAIL ADMIN_PASSWORD AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY DO_API_TOKEN JWT_SECRET POSTGRES_PASSWORD"
export KEYS $KEYS

awk -F= '
  BEGIN { n = split(ENVIRON["KEYS"], keys, " "); for (i = 1; i <= n; i++) set[keys[i]] = 1 }
  ($1 in set) { print $1 "=" ENVIRON[$1]; next }
  { print }
' .env.example > .env
chmod 600 .env

echo ""
echo "Wrote .env"
echo "  Admin email:    $ADMIN_EMAIL"
echo "  Admin password: $ADMIN_PASSWORD"
echo ""
echo "Start the stack:  docker compose up -d --build"
echo "Then open:        http://localhost:3000"
