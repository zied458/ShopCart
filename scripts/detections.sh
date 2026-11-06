#!/usr/bin/env bash
# Shows the alerts the API's detection rules raised (docs/detection.md), from the API logs.
#   bash scripts/detections.sh              Kubernetes test cluster (all API pods)
#   bash scripts/detections.sh compose      Docker Compose stack
#   REQUIRE=brute_force,injection_probe bash scripts/detections.sh    exit 1 unless those rules fired (CI)
# Writes reports/detections.md.
set -uo pipefail
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.."

if [[ "${1:-k8s}" == compose ]]; then
  docker compose logs --no-color --no-log-prefix api
else
  kubectl --context kind-tropicline -n tropicline logs -l app.kubernetes.io/name=api --prefix --tail=-1 --max-log-requests=10
fi | node scripts/ci/detections.mjs
