#!/usr/bin/env bash
# Proves the hardening of the running deployment, check by check: admission control (Kyverno and Pod Security),
# network isolation, least privilege and container settings. Prints a table, also as Markdown in
# reports/k8s-checks.md and on the GitHub Actions run page. Exits 1 if any check fails.
#   bash scripts/k8s/verify.sh
set -uo pipefail
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$ROOT/reports"
OUT="$ROOT/reports/k8s-checks.md"
K="kubectl --context kind-tropicline -n tropicline"
NODE=/nodejs/bin/node
failures=0
rows=()

# check <area> <what is expected> <expect: ok|refused> <command...>
check() {
  local area="$1" what="$2" expect="$3"; shift 3
  local output status got verdict plain
  output="$("$@" 2>&1)"; status=$?
  if [[ $status == 0 ]]; then got=ok; else got=refused; fi
  if [[ $got == "$expect" ]]; then verdict="✅ pass" plain=pass; else verdict="❌ FAIL" plain=FAIL; failures=$((failures + 1)); fi
  # Keep the reason the API server or the pod gave, on one line.
  local reason
  reason="$(echo "$output" | grep -oE '(denied the request|violates PodSecurity|ETIMEDOUT|EROFS|timed out|Connection timed out|uid=[0-9]+|uid [0-9]+|no$|yes$|open|refused|"status":"ok"|absent|present)[^|]{0,110}' | head -1 | tr -d '\r')"
  [[ -z "$reason" ]] && { [[ $status == 0 ]] && reason="admitted" || reason="exit $status"; }
  printf '%-5s %-66s %s\n' "$plain" "$what" "$reason"
  rows+=("| $area | $what | $verdict | \`${reason//|/\\|}\` |")
}

# A pod that meets every rule. Each admission test below breaks exactly one rule of it, and is sent with
# --dry-run=server: the API server runs all admission checks (Pod Security and Kyverno), but nothing is created.
pod() { # name image [key=JSON ...]: replaces one field of the compliant pod (podsc, sc, resources, env, token)
  local name="$1" image="$2"; shift 2
  local podsc='{"runAsNonRoot":true,"runAsUser":65532,"seccompProfile":{"type":"RuntimeDefault"}}'
  local sc='{"allowPrivilegeEscalation":false,"readOnlyRootFilesystem":true,"capabilities":{"drop":["ALL"]}}'
  local resources='{"limits":{"cpu":"100m","memory":"64Mi"}}' env='[]' token=false
  local kv; for kv in "$@"; do local "$kv"; done
  printf '{"apiVersion":"v1","kind":"Pod","metadata":{"name":"%s","namespace":"tropicline"},"spec":{"serviceAccountName":"api","automountServiceAccountToken":%s,"securityContext":%s,"containers":[{"name":"c","image":"%s","resources":%s,"env":%s,"securityContext":%s}]}}' \
    "$name" "$token" "$podsc" "$image" "$resources" "$env" "$sc"
}
admit() { echo "$1" | $K apply --dry-run=server -f -; }
API_IMAGE=ghcr.io/saramseibi/shopcart-api:local

echo "Admission control"
check "Admission" "A compliant pod is admitted (control case)" ok \
  admit "$(pod good $API_IMAGE)"
check "Admission" "Pod running as root is refused" refused \
  admit "$(pod root $API_IMAGE 'podsc={"runAsNonRoot":false,"runAsUser":0,"seccompProfile":{"type":"RuntimeDefault"}}')"
check "Admission" "Privileged container is refused" refused \
  admit "$(pod privileged $API_IMAGE 'sc={"privileged":true,"allowPrivilegeEscalation":true,"readOnlyRootFilesystem":true}')"
check "Admission" "Image from an untrusted registry (nginx:latest) is refused" refused \
  admit "$(pod untrusted nginx:latest)"
check "Admission" "Writable root filesystem is refused" refused \
  admit "$(pod writable $API_IMAGE 'sc={"allowPrivilegeEscalation":false,"readOnlyRootFilesystem":false,"capabilities":{"drop":["ALL"]}}')"
check "Admission" "Container without CPU/memory limits is refused" refused \
  admit "$(pod nolimits $API_IMAGE 'resources={}')"
check "Admission" "Secret passed as an environment variable is refused" refused \
  admit "$(pod secretenv $API_IMAGE 'env=[{"name":"JWT_SECRET","valueFrom":{"secretKeyRef":{"name":"tropicline-secrets","key":"jwt-secret"}}}]')"
check "Admission" "Pod mounting the Kubernetes API token is refused" refused \
  admit "$(pod token $API_IMAGE token=true)"

echo; echo "Network policies (default deny)"
tcp() { # pod, host, port: exit 0 when the TCP connection opens
  $K exec "$1" -- $NODE -e "require('net').connect($3,'$2').on('connect',()=>{console.log('open');process.exit(0)}).on('error',e=>{console.log(e.code);process.exit(1)}).setTimeout(3000,()=>{console.log('ETIMEDOUT');process.exit(1)})"
}
check "Network" "web → api:3000 allowed" ok $K exec deploy/web -- wget -qO- -T 3 http://api:3000/api/health
check "Network" "api → db:5432 allowed" ok tcp deploy/api db 5432
check "Network" "web → db:5432 blocked (the shop cannot reach the database)" refused sh -c "$K exec deploy/web -- nc -z -w 3 db 5432 || { echo 'timed out'; exit 1; }"
check "Network" "api → internet blocked (no data exfiltration)" refused \
  $K exec deploy/api -- $NODE -e "fetch('https://example.com',{signal:AbortSignal.timeout(4000)}).then(()=>console.log('open')).catch(e=>{console.log(e.cause?.code??'ETIMEDOUT');process.exit(1)})"
check "Network" "db → api:3000 blocked (the database talks to no one)" refused sh -c "$K exec db-0 -- nc -z -w 3 api 3000 || { echo 'timed out'; exit 1; }"

echo; echo "Least privilege"
for sa in web api db db-seed; do
  check "Privilege" "Service account '$sa' cannot read secrets via the Kubernetes API" refused \
    sh -c "$K auth can-i get secrets --as=system:serviceaccount:tropicline:$sa | grep -qx yes && echo yes || { echo no; exit 1; }"
done
check "Privilege" "No Kubernetes API token inside the API pod" refused \
  $K exec deploy/api -- $NODE -e "const p=require('fs').existsSync('/var/run/secrets/kubernetes.io/serviceaccount/token');console.log(p?'present':'absent');process.exit(p?0:1)"

echo; echo "Containers"
check "Container" "API runs as uid 65532 (not root)" ok $K exec deploy/api -- $NODE -e "const u=process.getuid();console.log('uid '+u);process.exit(u===65532?0:1)"
check "Container" "Shop runs as uid 101 (not root)" ok sh -c "$K exec deploy/web -- id | grep -o 'uid=101'"
check "Container" "API filesystem is read-only (writing its own code fails)" refused \
  $K exec deploy/api -- $NODE -e "require('fs').writeFileSync('/app/src/server.js','x')"
check "Container" "Secrets are files, not environment variables" refused \
  $K exec deploy/api -- $NODE -e "const k=Object.keys(process.env).filter(k=>/SECRET|PASSWORD/.test(k)&&!k.endsWith('_FILE'));console.log(k.length?'present':'absent');process.exit(k.length?0:1)"

{
  echo "## Kubernetes hardening checks"
  echo
  if [[ $failures == 0 ]]; then echo "**All ${#rows[@]} checks passed** on the live test cluster."; else echo "**$failures of ${#rows[@]} checks failed.**"; fi
  echo
  echo "| Area | Check | Result | Evidence |"
  echo "|---|---|---|---|"
  printf '%s\n' "${rows[@]}"
} > "$OUT"
[[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && cat "$OUT" >> "$GITHUB_STEP_SUMMARY"
echo; echo "$failures failed of ${#rows[@]} — report: reports/k8s-checks.md"
exit $(( failures > 0 ))
