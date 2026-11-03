// Forges an admin JWT (HS256) with a given signing key, then calls an admin-only route.
// Used to show that a leaked key works, and that it stops working once revoked (docs/secrets.md).
//   node scripts/demo/forge-token.mjs <base-url> <signing-key>
import { createHmac } from 'node:crypto'

const [base = 'http://localhost:8081', key] = process.argv.slice(2)
if (!key) {
  console.error('usage: node scripts/demo/forge-token.mjs <base-url> <signing-key>')
  process.exit(2)
}

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 1, name: 'Forged', email: 'nobody@example.com', role: 'admin', iat: now, exp: now + 300 })}`
const token = `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`

const res = await fetch(`${base}/api/admin/customers`, { headers: { authorization: `Bearer ${token}` } })
const data = await res.json().catch(() => ({}))
const summary = data.customers ? `${data.customers.length} customer records returned` : (data.error ?? "")
console.log(`GET /api/admin/customers with a forged admin token -> HTTP ${res.status} (${summary})`)
process.exit(res.status === 200 ? 0 : 1)
