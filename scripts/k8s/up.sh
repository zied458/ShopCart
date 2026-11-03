#!/usr/bin/env bash
# Creates the local test cluster (kind) and deploys Tropic Line on it, hardened. Same script on a laptop and in CI.
#   bash scripts/k8s/up.sh              cluster + Kyverno + images + secret + deploy + sample data
#   SEED=0 bash scripts/k8s/up.sh       redeploy without resetting the database
#   bash scripts/k8s/down.sh            delete the cluster
# Needs Docker and kubectl; kind is downloaded (pinned, checksum verified) into .tools/ when missing.
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash on Windows: keep paths as written

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
CLUSTER=tropicline
KIND_VERSION=v0.33.0
KYVERNO_VERSION=v1.19.2
API_IMAGE=ghcr.io/saramseibi/shopcart-api:local
WEB_IMAGE=ghcr.io/saramseibi/shopcart-web:local
K="kubectl --context kind-$CLUSTER"

# Paths handed to kubectl.exe on Windows must be Windows paths.
native() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else echo "$1"; fi; }
step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

# --- kind
if command -v kind >/dev/null; then KIND=kind
elif [[ -x .tools/kind.exe ]]; then KIND=.tools/kind.exe
elif [[ -x .tools/kind ]]; then KIND=.tools/kind
else
  step "Downloading kind $KIND_VERSION"
  mkdir -p .tools
  url="https://github.com/kubernetes-sigs/kind/releases/download/$KIND_VERSION/kind-linux-amd64"
  curl -fsSLo .tools/kind "$url"
  echo "$(curl -fsSL "$url.sha256sum" | cut -d' ' -f1)  .tools/kind" | sha256sum -c -
  chmod +x .tools/kind
  KIND=.tools/kind
fi

step "1/6 Cluster"
if $KIND get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  echo "reusing cluster $CLUSTER"
else
  $KIND create cluster --config k8s/kind-cluster.yaml --wait 180s
fi

step "2/6 Admission control: Kyverno $KYVERNO_VERSION"
if ! $K get namespace kyverno >/dev/null 2>&1; then
  $K create -f "https://github.com/kyverno/kyverno/releases/download/$KYVERNO_VERSION/install.yaml" >/dev/null
fi
$K -n kyverno rollout status deployment/kyverno-admission-controller --timeout=300s
$K apply -f k8s/base/namespace.yaml
$K apply -f k8s/policies/
# The policies are live once the API server refuses a pod that breaks them.
probe='{"apiVersion":"v1","kind":"Pod","metadata":{"name":"policy-probe","namespace":"tropicline"},"spec":{"containers":[{"name":"c","image":"busybox"}]}}'
for i in $(seq 60); do
  if ! echo "$probe" | $K apply --dry-run=server -f - >/dev/null 2>&1; then echo "policies enforced"; break; fi
  [[ $i == 60 ]] && { echo "Kyverno policies are not enforced after 120 s" >&2; exit 1; }
  sleep 2
done

step "3/6 Images (built here, loaded into the cluster, never pushed)"
if [[ "${SKIP_BUILD:-0}" != 1 ]]; then
  docker build -q -t "$API_IMAGE" backend
  docker build -q -t "$WEB_IMAGE" frontend
fi
$KIND load docker-image --name "$CLUSTER" "$API_IMAGE" "$WEB_IMAGE"

step "4/6 Secrets (random, created at deploy time, stored nowhere else)"
if $K -n tropicline get secret tropicline-secrets >/dev/null 2>&1; then
  echo "kept the existing secret (rotate it with scripts/k8s/rotate-secrets.sh)"
else
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  (umask 077
   openssl rand -hex 32 | tr -d '\r\n' > "$tmp/db-password"
   openssl rand -hex 32 | tr -d '\r\n' > "$tmp/jwt-secret")
  $K -n tropicline create secret generic tropicline-secrets \
    --from-file=db-password="$(native "$tmp/db-password")" --from-file=jwt-secret="$(native "$tmp/jwt-secret")"
  rm -rf "$tmp"
fi

step "5/6 Deploy"
$K apply -k k8s/base
$K -n tropicline rollout status statefulset/db --timeout=240s
$K -n tropicline rollout restart deployment/api deployment/web >/dev/null # pick up rebuilt images with the same tag
$K -n tropicline rollout status deployment/api --timeout=240s
$K -n tropicline rollout status deployment/web --timeout=240s

step "6/6 Sample data"
if [[ "${SEED:-1}" == 1 ]]; then
  $K -n tropicline delete job db-seed --ignore-not-found >/dev/null
  $K apply -k k8s/seed
  $K -n tropicline wait --for=condition=complete job/db-seed --timeout=180s
  $K -n tropicline logs job/db-seed | tail -3
else
  echo "skipped (SEED=0)"
fi

for i in $(seq 30); do curl -fsS http://127.0.0.1:8090/api/health >/dev/null 2>&1 && break; sleep 2; done
echo
$K -n tropicline get pods -o wide
echo
echo "Tropic Line is running on http://127.0.0.1:8090"
