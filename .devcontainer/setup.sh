#!/usr/bin/env bash
# Runs once when the Codespace (or dev container) is created.
set -euo pipefail

npm install

# Create .env from the example on first run, with a fresh auth secret.
if [ ! -f .env ]; then
  cp .env.example .env
  secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=${secret}|" .env
  echo "Created .env"
fi

# Wait for Postgres, then apply migrations.
for i in {1..30}; do
  if node -e "require('net').connect(5432,'db').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"; then
    break
  fi
  echo "Waiting for Postgres…"
  sleep 1
done

npm run db:migrate

echo ""
echo "Braid is ready. Run: npm run dev"
