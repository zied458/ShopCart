#!/usr/bin/env bash
# Runs the CI security stage locally, with the same tools, versions and blocking rules
# (see .github/workflows/ci.yml and docs/pipeline-policy.md). Needs Docker.
#   bash scripts/security-scan.sh            all checks
#   bash scripts/security-scan.sh secrets    one check: secrets | sast | deps | iac | images
set -uo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash on Windows: keep container paths as written

TRIVY_IMAGE=aquasec/trivy:0.76.1
GITLEAKS_IMAGE=ghcr.io/gitleaks/gitleaks:v8.30.1
SEMGREP_IMAGE=semgrep/semgrep:1.182.1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) MOUNT="$(cygpath -m "$ROOT")" ;; *) MOUNT="$ROOT" ;; esac
REPORTS="$ROOT/reports"
mkdir -p "$REPORTS"
ONLY="${1:-all}"
declare -A RESULT

run() { # name, command...
  local name="$1"; shift
  [[ "$ONLY" != all && "$ONLY" != "$name" ]] && return
  echo; echo "──── $name"
  if "$@"; then RESULT[$name]=PASS; else RESULT[$name]=FAIL; fi
}

secrets() {
  local mode=dir
  [[ -d "$ROOT/.git" ]] && mode=git # scan the whole history when the repository exists
  docker run --rm -v "$MOUNT:/repo" -w /repo "$GITLEAKS_IMAGE" "$mode" /repo \
    --config /repo/.gitleaks.toml --redact --no-banner \
    --report-format json --report-path /repo/reports/gitleaks.json --exit-code 1
}

sast() {
  docker run --rm -v "$MOUNT:/src" -w /src "$SEMGREP_IMAGE" semgrep scan --quiet \
    --config p/default --config .semgrep/ --metrics=off --json-output=reports/semgrep.json backend/src frontend/src >/dev/null
  node -e '
    const r = require(process.argv[1]); let errors = 0
    for (const f of r.results) { if (f.extra.severity === "ERROR") errors++
      console.log(f.extra.severity.padEnd(8), f.check_id.split(".").pop().padEnd(40), `${f.path}:${f.start.line}`) }
    console.log(`Blocking findings (ERROR): ${errors}`); process.exit(errors ? 1 : 0)' "$REPORTS/semgrep.json"
}

deps() {
  docker run --rm -v trivy-cache:/root/.cache -v "$MOUNT:/src" -w /src "$TRIVY_IMAGE" fs --quiet --scanners vuln \
    --severity HIGH,CRITICAL --ignore-unfixed --ignorefile .trivyignore --exit-code 1 .
}

iac() {
  docker run --rm -v trivy-cache:/root/.cache -v "$MOUNT:/src" -w /src "$TRIVY_IMAGE" config --quiet \
    --skip-dirs node_modules --severity HIGH,CRITICAL --exit-code 1 .
}

images() {
  local failed=0
  for svc in backend frontend; do
    docker build -q -t "tropicline-$svc:scan" "$MOUNT/$svc" >/dev/null || { failed=1; continue; }
    local user; user=$(docker image inspect "tropicline-$svc:scan" --format '{{.Config.User}}')
    case "${user%%:*}" in ""|root|0) echo "$svc: runs as root"; failed=1 ;; *) echo "$svc: runs as user $user" ;; esac
    docker run --rm -v trivy-cache:/root/.cache -v //var/run/docker.sock:/var/run/docker.sock -v "$MOUNT:/src" -w /src \
      "$TRIVY_IMAGE" image --quiet --scanners vuln,secret --severity HIGH,CRITICAL --ignore-unfixed \
      --ignorefile .trivyignore --exit-code 1 "tropicline-$svc:scan" || failed=1
  done
  return $failed
}

run secrets secrets
run sast sast
run deps deps
run iac iac
run images images

echo; echo "──── Security stage"
status=0
for k in secrets sast deps iac images; do
  [[ -n "${RESULT[$k]:-}" ]] || continue
  printf '  %-8s %s\n' "$k" "${RESULT[$k]}"
  [[ "${RESULT[$k]}" == FAIL ]] && status=1
done
[[ $status -eq 0 ]] && echo "  → the build would pass" || echo "  → the build would be BLOCKED"
exit $status
