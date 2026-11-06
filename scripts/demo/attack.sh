#!/usr/bin/env bash
# Live demo of runtime detection: three small attacks against the deployed shop, then the alerts they raised.
#   bash scripts/demo/attack.sh                           Kubernetes test cluster (http://127.0.0.1:8090)
#   bash scripts/demo/attack.sh http://localhost:8081     Docker Compose stack
# Only for our own test environment.
set -uo pipefail
cd "$(dirname "$0")/../.."
BASE="${1:-http://127.0.0.1:8090}"
TARGET=k8s; [[ "$BASE" == *8081* ]] && TARGET=compose
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "── 1. Brute force: wrong passwords on a customer account"
for i in $(seq 1 12); do
  printf '%s ' "$(code -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
    -d "{\"email\":\"karim.b@example.com\",\"password\":\"guess-$i\"}")"
done
echo "  (401 = wrong password, 429 = locked out)"

echo "── 2. SQL injection probes on the search"
for p in "' OR '1'='1" "x' UNION SELECT email, password_hash FROM users --" "1; DROP TABLE users"; do
  printf '%s ' "$(code -G "$BASE/api/products" --data-urlencode "search=$p")"
done
echo "  (200 = harmless now: the query is parameterised, but the attempt is seen)"

echo "── 3. Order enumeration as a customer (IDOR probing)"
TOKEN="$(curl -s -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d '{"email":"sana.m@example.com","password":"Customer-2026"}' | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).token??""))')"
for id in $(seq 1001 1014); do printf '%s ' "$(code -H "Authorization: Bearer $TOKEN" "$BASE/api/orders/$id")"; done
echo "  (404 = not yours)"

echo; echo "── Alerts in the API logs"
sleep 1
bash scripts/detections.sh "$TARGET" | sed -n '1,20p'
