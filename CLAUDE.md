# Tropic Line — ShopCart (DevSecOps course project)

Online coffee shop built for the TEK-UP ING-5-SSIR DevSecOps project (teacher: Oussema Mansouri). The first commit
(`c70fc4a`) is deliberately vulnerable (flaws V1–V8, `docs/vulnerabilities.md`); each flaw is fixed in its own
commit with a regression test (`docs/corrections.md`). Project docs are in French; code and comments in English.

## Stack and layout
- `frontend/` React 19 + TypeScript + Vite + Tailwind v4, served by nginx (`frontend/nginx/`)
- `backend/` Node 24 + Express 5 + PostgreSQL 17; detection in `backend/src/security.js`; tests in `backend/test/`
- `k8s/` kind cluster, manifests (`base/`), seed job, Kyverno policies; `zap/` ZAP plan + OpenAPI
- `scripts/` secrets, k8s up/verify/rotate/down, ZAP, detection, demo attacks, CI summaries
- `docs/` security docs (French); `docs/report/rapport-securite.tex` + PDF (security report, 7 pages)

## Run it
```bash
bash scripts/new-secrets.sh                 # once: random secrets in .secrets/ (ignored by Git)
docker compose up -d --build                # shop + API + db on http://localhost:8081
bash scripts/k8s/up.sh                      # hardened kind cluster on http://127.0.0.1:8090 (~3-6 min)
bash scripts/k8s/verify.sh                  # 22 hardening checks
BASE_URL=http://127.0.0.1:8090 npm --prefix backend run test:security   # 19 security regression tests
bash scripts/zap-scan.sh                    # authenticated ZAP scan (~15 min on Windows)
bash scripts/demo/attack.sh                 # detection demo: brute force, injection, enumeration → alerts
```
Test accounts: `admin@tropicline.local` / `Admin-Tropic-2026`; customers `amel.t@example.com`, `sana.m@example.com`,
`karim.b@example.com` / `Customer-2026` (sample data, not secrets).

## Rules
- Never write a secret in the code, the repo or a commit. Secrets are files mounted at runtime (`.secrets/` locally,
  Kubernetes Secret `tropicline-secrets`), never environment variables. Gitleaks scans the whole history in CI.
- The Git history was purged of old leaked values and force-pushed. Never push from an old clone (one whose first
  commit is `0a4cdf9`): it would bring the leaked values back.
- Remote: `github.com/zied458/ShopCart`, branch `master`. Commit or push only when asked.
- Offensive testing only against our own local instances (Compose or the kind cluster).
- A new flaw fix comes with a test in `backend/test/security.test.mjs` that fails before the fix.
- CI: `.github/workflows/ci.yml` (blocking security stage, deploy + tests + ZAP + detection, publish). Policy and
  thresholds: `docs/pipeline-policy.md`. Each gate writes a summary table via `scripts/ci/summary.mjs`.
- Design: keep the existing tokens in `frontend/src/index.css` and the brand look (no gradients, no generic UI).

## Windows gotchas (Git Bash)
- Docker volume paths: `export MSYS_NO_PATHCONV=1` and `$(cygpath -m "$PWD")`; Windows `git`/`kubectl` need `C:/` paths.
- `openssl rand` output on Windows ends with `\r`: strip with `tr -d '\r\n'`.
- Trivy: never add a root `trivy.yaml` with `skip-dirs: **/node_modules` — it also hides `node_modules` in image
  scans (lodash was missed once). Pass `--skip-dirs` to fs/config scans only.
- If the Compose database volume existed before with another password, recreate it: `docker compose down -v`.

## Still to do
Slides for the defence, one contribution sheet per team member (Annexe B), wording of the AI-use declaration in
the report (it must stay in the report: the brief requires it).
