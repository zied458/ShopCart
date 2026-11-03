#!/usr/bin/env bash
# "Revoke first, purge after" — the purge step (docs/secrets.md).
# Rewrites the Git history so that leaked values disappear from every commit, then proves it with Gitleaks.
# Run it ONLY once the leaked secrets are revoked: purging does not make a leaked value safe (clones, forks,
# CI logs and caches keep copies); revoking does. Purging stops the value from spreading further.
#
#   bash scripts/purge-history.sh          rewrite a fresh mirror of origin in .purge/ and scan it — nothing is pushed
#   bash scripts/purge-history.sh --push   the same, then force-push the rewritten history to origin
#
# The leaked values are read from .secrets/leaked-values.txt (ignored by Git), one per line; each one becomes
# ***REMOVED*** in every commit. Every commit id changes: everyone must re-clone afterwards.
set -euo pipefail
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIST="$ROOT/.secrets/leaked-values.txt"
WORK="$ROOT/.purge"
GITLEAKS_IMAGE=ghcr.io/gitleaks/gitleaks:v8.30.1
FILTER_REPO_VERSION=2.47.0
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) MOUNT() { cygpath -m "$1"; } ;; *) MOUNT() { echo "$1"; } ;; esac

[[ -s "$LIST" ]] || { echo "Write the leaked values, one per line, in .secrets/leaked-values.txt" >&2; exit 1; }
ORIGIN="$(git -C "$ROOT" remote get-url origin)"

echo "── 1. Fresh mirror of $ORIGIN (what the world can see)"
rm -rf "$WORK" && mkdir -p "$WORK"
git clone --quiet --mirror "$ORIGIN" "$WORK/repo.git"
tr -d '\r' < "$LIST" | grep -v '^\s*$' > "$WORK/replacements.txt"
echo "$(wc -l < "$WORK/replacements.txt") value(s) to remove"

echo "── 2. Before: Gitleaks on the current history"
docker run --rm -v "$(MOUNT "$WORK"):/work" -v "$(MOUNT "$ROOT/.gitleaks.toml"):/cfg.toml:ro" "$GITLEAKS_IMAGE" \
  git /work/repo.git --config /cfg.toml --redact --no-banner --exit-code 0 2>&1 | tail -2

echo "── 3. Rewrite every commit with git-filter-repo $FILTER_REPO_VERSION"
docker run --rm -v "$(MOUNT "$WORK"):/work" -w /work/repo.git python:3.13-alpine sh -c "
  apk add -q --no-cache git >/dev/null &&
  pip install -q --root-user-action=ignore git-filter-repo==$FILTER_REPO_VERSION &&
  git config --global --add safe.directory /work/repo.git &&
  git filter-repo --replace-text /work/replacements.txt --force &&
  chown -R $(id -u):$(id -g) /work"
rm -f "$WORK/replacements.txt"

echo "── 4. After: Gitleaks on the rewritten history (must find nothing)"
docker run --rm -v "$(MOUNT "$WORK"):/work" -v "$(MOUNT "$ROOT/.gitleaks.toml"):/cfg.toml:ro" "$GITLEAKS_IMAGE" \
  git /work/repo.git --config /cfg.toml --redact --no-banner --exit-code 1
echo "clean: no secret left in any commit"
if git -C "$WORK/repo.git" log --all -p | grep -qF -f <(tr -d '\r' < "$LIST" | grep -v '^\s*$'); then
  echo "a leaked value is still present" >&2; exit 1
fi

if [[ "${1:-}" != --push ]]; then
  echo
  echo "Nothing pushed. Rewritten mirror: .purge/repo.git"
  echo "To publish it: bash scripts/purge-history.sh --push"
  exit 0
fi

echo "── 5. Force-push the rewritten history"
git -C "$WORK/repo.git" push --force "$ORIGIN" 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'
cat <<EOF

Done. Next:
  - this folder:  git fetch origin && git reset --hard origin/main   (commit or stash local work first)
  - teammates:    delete their clone and clone again
  - GitHub keeps unreachable commits for a while (and in forks / pull requests): ask GitHub Support to purge
    cached views if the repository was public when the secret leaked.
EOF
