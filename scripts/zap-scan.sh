#!/usr/bin/env bash
# Authenticated dynamic scan (DAST) of the deployed shop with OWASP ZAP, after scripts/k8s/up.sh.
#   bash scripts/zap-scan.sh                         scans http://127.0.0.1:8090 (the kind cluster)
#   bash scripts/zap-scan.sh http://127.0.0.1:8081   scans the Docker Compose stack instead
# Signs in as a test customer and gives ZAP the token, so every request is authenticated.
# Reports: reports/zap/zap-report.{html,json}. Exits 1 when ZAP raises a High-risk alert (docs/pipeline-policy.md).
set -euo pipefail
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ZAP_IMAGE=zaproxy/zap-stable:2.17.0
BASE="${1:-http://127.0.0.1:8090}"
ZAP_USER="${ZAP_USER:-amel.t@example.com}"
ZAP_PASSWORD="${ZAP_PASSWORD:-Customer-2026}" # sample account from backend/db/init.js, not a real credential
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) MOUNT() { cygpath -m "$1"; } ;; *) MOUNT() { echo "$1"; } ;; esac

# 1. Sign in like the shop does, and keep the token for ZAP.
TOKEN="$(curl -fsS -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$ZAP_USER\",\"password\":\"$ZAP_PASSWORD\"}" |
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).token))')"
[[ -n "$TOKEN" ]] || { echo "Sign-in failed for $ZAP_USER" >&2; exit 1; }
echo "signed in as $ZAP_USER"

# 2. ZAP runs in a container. On Linux (CI) it shares the host network; elsewhere it reaches the host by name.
if [[ "$(uname -s)" == Linux ]]; then NET=(--network host); TARGET="$BASE"
else NET=(); TARGET="${BASE/127.0.0.1/host.docker.internal}"; TARGET="${TARGET/localhost/host.docker.internal}"
fi

rm -rf reports/zap && mkdir -p reports/zap && chmod 777 reports/zap # ZAP's user (uid 1000) writes here
status=0
docker run --rm "${NET[@]}" \
  -e TARGET="$TARGET" \
  -e ZAP_AUTH_HEADER=Authorization -e ZAP_AUTH_HEADER_VALUE="Bearer $TOKEN" \
  -v "$(MOUNT "$ROOT/zap"):/zap/wrk/plan:ro" -v "$(MOUNT "$ROOT/reports/zap"):/zap/wrk/out" \
  "$ZAP_IMAGE" zap.sh -cmd -autorun /zap/wrk/plan/plan.yaml || status=$?
unset TOKEN

# 3. Summary and verdict: the plan fails when it cannot run (status 1); the alerts are judged here.
[[ -f reports/zap/zap-report.json ]] || { echo "ZAP produced no report (exit $status)" >&2; exit 1; }
node scripts/ci/summary.mjs zap reports/zap/zap-report.json > reports/zap/summary.md
[[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && cat reports/zap/summary.md >> "$GITHUB_STEP_SUMMARY"
high="$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(r.site.flatMap(s=>s.alerts).filter(a=>+a.riskcode>=3).length)' reports/zap/zap-report.json)"
echo; sed -n '1,8p' reports/zap/summary.md
echo "High-risk alerts: $high (report: reports/zap/zap-report.html)"
[[ $status -le 2 ]] || exit "$status" # 2 = the plan finished with warnings
[[ "$high" == 0 ]]
