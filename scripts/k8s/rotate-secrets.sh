#!/usr/bin/env bash
# Revokes the deployed secrets by replacing them (incident response: "revoke first, purge after", docs/secrets.md).
#   bash scripts/k8s/rotate-secrets.sh            both: signing key and database password
#   bash scripts/k8s/rotate-secrets.sh jwt        only the signing key   (every session and forged token dies)
#   bash scripts/k8s/rotate-secrets.sh db         only the database password
# New values are random, go straight into the cluster, and are never printed or written to the repository.
set -euo pipefail
export MSYS_NO_PATHCONV=1
WHAT="${1:-all}"
K="kubectl --context kind-tropicline -n tropicline"
native() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else echo "$1"; fi; }
read_key() { $K get secret tropicline-secrets -o "jsonpath={.data.$1}" | base64 -d; }

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
(umask 077
 read_key db-password > "$tmp/db-password"
 read_key jwt-secret > "$tmp/jwt-secret")

if [[ $WHAT == all || $WHAT == jwt ]]; then
  (umask 077; openssl rand -hex 32 | tr -d '\r\n' > "$tmp/jwt-secret")
  echo "new signing key generated"
fi
if [[ $WHAT == all || $WHAT == db ]]; then
  (umask 077; openssl rand -hex 32 | tr -d '\r\n' > "$tmp/db-password")
  # Change it inside PostgreSQL first (local socket, the value travels on stdin, not on a command line).
  printf "ALTER USER tropicline PASSWORD '%s';\n" "$(cat "$tmp/db-password")" |
    $K exec -i db-0 -- psql -q -v ON_ERROR_STOP=1 -U tropicline -d tropicline
  echo "database password changed in PostgreSQL"
fi

$K create secret generic tropicline-secrets --dry-run=client -o yaml \
  --from-file=db-password="$(native "$tmp/db-password")" --from-file=jwt-secret="$(native "$tmp/jwt-secret")" |
  $K apply -f - >/dev/null
echo "Kubernetes secret replaced"

# The API reads its secrets at start-up: restart it so the old values stop working everywhere.
$K rollout restart deployment/api >/dev/null
$K rollout status deployment/api --timeout=180s
echo "done: the previous values no longer work"
