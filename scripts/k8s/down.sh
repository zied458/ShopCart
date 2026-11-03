#!/usr/bin/env bash
# Deletes the local test cluster and everything in it (database included).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KIND=kind
command -v kind >/dev/null || KIND="$(ls "$ROOT"/.tools/kind* 2>/dev/null | head -1)"
"$KIND" delete cluster --name tropicline
