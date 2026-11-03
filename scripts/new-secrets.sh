#!/usr/bin/env bash
# Creates the local secrets for Docker Compose and `npm run dev`, if they do not exist yet.
# They are random, live only in .secrets/ (ignored by Git) and never appear in the code.
#   bash scripts/new-secrets.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/.secrets"
mkdir -p "$DIR"
# The folder is private to you; the files inside stay readable so the container users
# (postgres, and the API's user 65532) can read them through their bind mounts.
chmod 700 "$DIR" 2>/dev/null || true

for name in jwt_secret db_password; do
  if [[ -s "$DIR/$name" ]]; then
    echo "kept     .secrets/$name"
  else
    (umask 022 && openssl rand -hex 32 | tr -d '\r\n' > "$DIR/$name")
    echo "created  .secrets/$name"
  fi
done

# The API reads the files, not the values, when run with npm run dev.
if [[ ! -f "$ROOT/backend/.env" ]]; then
  printf 'DB_PASSWORD_FILE=../.secrets/db_password\nJWT_SECRET_FILE=../.secrets/jwt_secret\n' > "$ROOT/backend/.env"
  echo "created  backend/.env (paths only)"
fi
