# Tropic Line — ShopCart (projet DevSecOps)

Online shop for a fictional coffee roaster, built to be secured across its whole life cycle for the
ING-5-SSIR DevSecOps project. **It still contains deliberate flaws** (V1–V5, V7, V8; V6 is fixed): see
[docs/vulnerabilities.md](docs/vulnerabilities.md). Run it only on your own machine.

```
frontend/   React + Vite + Tailwind shop (port 5173 in dev, 4173 in preview)
backend/    Node.js + Express API (port 3000)
k8s/        Kubernetes manifests, Kyverno policies, kind cluster
zap/        OWASP ZAP scan plan and API description
scripts/    Secrets, cluster, scans, CI summaries
docker-compose.yml   PostgreSQL 17 for development (host port 5433)
docs/       Security documentation (in French)
```

## Run it locally

Needs Node.js 22+ and Docker Desktop.

```bash
# 0. secrets: random values in .secrets/ (ignored by Git), once
bash scripts/new-secrets.sh

# 1. database
docker compose up -d db

# 2. API (first time: install and load test data)
cd backend
npm install
npm run db:init      # recreates the tables and test data; run again any time to reset
npm run dev          # http://localhost:3000/api/health

# 3. shop, in a second terminal
cd frontend
npm install
npm run dev          # http://localhost:5173
```

### Or run everything in containers

```bash
docker compose up -d --build     # shop + API + database on http://localhost:8081
```

Images: `backend/Dockerfile` (distroless Node 24, user 65532) and `frontend/Dockerfile`
(unprivileged nginx, user 101). Both are multi-stage, run read-only with every Linux capability dropped.

### Or on Kubernetes (hardened test cluster)

```bash
bash scripts/k8s/up.sh       # kind cluster + Kyverno + deploy: http://127.0.0.1:8090
bash scripts/k8s/verify.sh   # 22 hardening checks on the live cluster
bash scripts/zap-scan.sh     # authenticated OWASP ZAP scan
bash scripts/k8s/down.sh
```

See [docs/kubernetes.md](docs/kubernetes.md), [docs/dast.md](docs/dast.md) and [docs/secrets.md](docs/secrets.md).

## Security checks

```bash
bash scripts/security-scan.sh    # the CI security stage, locally (needs Docker)
```

Pipeline: [.github/workflows/ci.yml](.github/workflows/ci.yml): build, secrets, code, dependencies,
deployment files, images, then a hardened Kubernetes deployment scanned by ZAP. Each run page shows a
summary table per gate and a final **Security report**. Blocking rules and exceptions:
[docs/pipeline-policy.md](docs/pipeline-policy.md). Local reports land in `reports/`.

## Test accounts (local lab only)

| Role | Email | Password |
|---|---|---|
| Admin | admin@tropicline.local | Admin-Tropic-2026 |
| Customer | amel.t@example.com | Customer-2026 |
| Customer | sana.m@example.com | Customer-2026 |

## API

| Method | Path | Access |
|---|---|---|
| GET | `/api/health` | public |
| POST | `/api/auth/register`, `/api/auth/login` | public |
| GET | `/api/auth/me` | signed in |
| GET | `/api/products?search=&sort=` · `/api/products/:slug` | public |
| GET / POST | `/api/products/:slug/reviews` | public / signed in |
| POST | `/api/orders` | public (guest checkout) |
| GET | `/api/orders/mine` · `/api/orders/:id` | signed in |
| PATCH | `/api/users/me` | signed in |
| GET / PATCH | `/api/admin/orders`, `/api/admin/orders/:id`, `/api/admin/products/:slug`, `/api/admin/customers` | admin |
