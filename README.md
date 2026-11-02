# Tropic Line — ShopCart (projet DevSecOps)

Online shop for a fictional coffee roaster, built to be secured across its whole life cycle for the
ING-5-SSIR DevSecOps project. **The current version is deliberately vulnerable**: see
[docs/vulnerabilities.md](docs/vulnerabilities.md). Run it only on your own machine.

```
frontend/   React + Vite + Tailwind shop (port 5173 in dev, 4173 in preview)
backend/    Node.js + Express API (port 3000)
docker-compose.yml   PostgreSQL 17 for development (host port 5433)
docs/       Security documentation
```

## Run it locally

Needs Node.js 22+ and Docker Desktop.

```bash
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

## Security checks

```bash
bash scripts/security-scan.sh    # the CI security stage, locally (needs Docker)
```

Pipeline: [.github/workflows/ci.yml](.github/workflows/ci.yml). Blocking rules and exceptions:
[docs/pipeline-policy.md](docs/pipeline-policy.md). Reports land in `reports/`.

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
