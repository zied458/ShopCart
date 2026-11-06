// Security regression tests: one or more per planted flaw (docs/vulnerabilities.md), plus control tests that
// the normal features still work. They run against a deployed shop, through nginx, like a real visitor:
//   BASE_URL=http://localhost:8081 node --test test/        (Docker Compose)
//   BASE_URL=http://127.0.0.1:8090 node --test test/        (Kubernetes test cluster, as in CI)
// Each "V…" test FAILS on the vulnerable version and passes once the flaw is fixed.
// The accounts are the sample ones from db/init.js. Tests create orders, reviews and accounts: use a test stack.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const BASE = (process.env.BASE_URL ?? 'http://localhost:8081').replace(/\/$/, '')
const ADMIN = { email: 'admin@tropicline.local', password: 'Admin-Tropic-2026' }
const AMEL = { email: 'amel.t@example.com', password: 'Customer-2026' }

async function call(method, path, { token, body, raw, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, headers: res.headers, data, text }
}

const tokens = {}
async function signIn(who) {
  if (!tokens[who.email]) {
    const r = await call('POST', '/api/auth/login', { body: who })
    assert.equal(r.status, 200, `sign-in failed for ${who.email}`)
    tokens[who.email] = r.data.token
  }
  return tokens[who.email]
}

const delivery = { name: 'Amel T.', email: AMEL.email, phone: '+216 20 000 000', address: '12 rue de Marseille', city: 'Tunis' }

// ---------------------------------------------------------------- the shop still works
test('Control · the catalogue loads and a normal search finds Kenya', async () => {
  const all = await call('GET', '/api/products')
  assert.equal(all.status, 200)
  assert.ok(all.data.products.length >= 10)
  const kenya = await call('GET', '/api/products?search=kenya')
  assert.ok(kenya.data.products.some((p) => p.slug === 'kenya-nyeri'))
})

test('Control · a customer signs in and orders at the catalogue price', async () => {
  const token = await signIn(AMEL)
  const r = await call('POST', '/api/orders', { token, body: { ...delivery, items: [{ slug: 'paper-filters', qty: 1, price: 18 }] } }) // as the shop sends it
  assert.equal(r.status, 201)
  assert.equal(r.data.order.items[0].unit_price, 18)
  const mine = await call('GET', '/api/orders/mine', { token })
  assert.ok(mine.data.orders.some((o) => o.id === r.data.order.id))
})

test('Control · the admin reads the customer list', async () => {
  const r = await call('GET', '/api/admin/customers', { token: await signIn(ADMIN) })
  assert.equal(r.status, 200)
  assert.ok(r.data.customers.length >= 4)
})

// ---------------------------------------------------------------- V1 SQL injection
test('V1 · a quote in the search is treated as text, not SQL', async () => {
  const r = await call('GET', `/api/products?search=${encodeURIComponent("'")}`)
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${r.text.slice(0, 120)}`)
  assert.deepEqual(r.data.products, [])
})

test('V1 · a UNION payload cannot read the users table', async () => {
  const payload = "zzz' UNION SELECT id, email, 'coffee', password_hash, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL FROM users -- "
  const r = await call('GET', `/api/products?search=${encodeURIComponent(payload)}`)
  const leaked = (r.data.products ?? []).filter((p) => String(p.slug).includes('@'))
  assert.equal(leaked.length, 0, `${leaked.length} accounts (email + password hash) returned by the search`)
})

// ---------------------------------------------------------------- V2 price tampering
test('V2 · the price sent by the browser is ignored', async () => {
  const token = await signIn(AMEL)
  const r = await call('POST', '/api/orders', { token, body: { ...delivery, items: [{ slug: 'paper-filters', qty: 2, price: 0.001 }] } })
  assert.equal(r.status, 201)
  assert.equal(r.data.order.items[0].unit_price, 18, 'unit price taken from the request')
  assert.equal(r.data.order.total, 2 * 18 + 7)
})

// ---------------------------------------------------------------- V3 IDOR
test("V3 · a customer cannot read another customer's order", async () => {
  const token = await signIn(AMEL)
  const me = (await call('GET', '/api/auth/me', { token })).data.user
  const all = await call('GET', '/api/admin/orders', { token: await signIn(ADMIN) })
  // Another account's order (by owner, not by the e-mail typed at checkout, which a customer can set freely).
  const other = all.data.orders.find((o) => o.user_id && o.user_id !== me.id)
  assert.ok(other, 'no order from another customer to test with')
  const r = await call('GET', `/api/orders/${other.id}`, { token })
  assert.equal(r.status, 404, `order ${other.id} of ${other.email} answered ${r.status}`)
  assert.ok(!r.text.includes(other.phone ?? '§'), 'the other customer’s phone number is in the response')
})

test('V3 · a customer still reads their own order', async () => {
  const token = await signIn(AMEL)
  const mine = await call('GET', '/api/orders/mine', { token })
  const id = mine.data.orders[0]?.id
  assert.ok(id)
  assert.equal((await call('GET', `/api/orders/${id}`, { token })).status, 200)
})

// ---------------------------------------------------------------- V4 role escalation
test('V4 · signing up with "role": "admin" gives a customer account', async () => {
  const email = `v4-${Date.now()}@example.com`
  const r = await call('POST', '/api/auth/register', { body: { name: 'Mallory', email, password: 'Mallory-2026-x', role: 'admin' } })
  assert.equal(r.status, 201)
  assert.equal(r.data.user.role, 'customer')
  const admin = await call('GET', '/api/admin/customers', { token: r.data.token })
  assert.equal(admin.status, 403, `admin route answered ${admin.status}`)
})

// ---------------------------------------------------------------- V5 stored XSS
test('V5 · the shop forbids inline scripts (Content-Security-Policy)', async () => {
  const r = await call('GET', '/')
  const csp = r.headers.get('content-security-policy') ?? ''
  assert.match(csp, /script-src 'self'/, 'no script-src in the CSP')
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/, 'the CSP allows inline scripts')
})

test('V5 · a review is returned as text in JSON that browsers will not sniff as HTML', async () => {
  const body = '<img src=x onerror="alert(document.cookie)"> Great beans'
  const token = await signIn(AMEL)
  const post = await call('POST', '/api/products/kenya-nyeri/reviews', { token, body: { rating: 5, body } })
  assert.equal(post.status, 201)
  const r = await call('GET', '/api/products/kenya-nyeri/reviews')
  assert.match(r.headers.get('content-type') ?? '', /application\/json/)
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
  assert.ok(r.data.reviews.some((x) => x.body === body), 'the text did not round-trip unchanged')
})

test('V5 · an oversized review is refused', async () => {
  const r = await call('POST', '/api/products/kenya-nyeri/reviews', { token: await signIn(AMEL), body: { rating: 5, body: 'a'.repeat(5000) } })
  assert.equal(r.status, 400)
})

// ---------------------------------------------------------------- V7 vulnerable lodash / prototype pollution
test('V7 · a prototype-pollution payload changes nothing on the server', async () => {
  // CVE-2019-10744: lodash.defaultsDeep copies "constructor.prototype" into Object.prototype.
  // Detector: an order line without a grind would then inherit the polluted "grind" value.
  const token = await signIn(AMEL)
  const raw = '{"city":"Tunis","constructor":{"prototype":{"grind":"espresso"}},"__proto__":{"grind":"espresso"}}'
  const r = await call('PATCH', '/api/users/me', { token, raw })
  assert.ok(r.status < 500, `PATCH answered ${r.status}`)
  for (let i = 0; i < 4; i++) { // several orders, so that every API replica is checked
    const order = await call('POST', '/api/orders', { token, body: { ...delivery, items: [{ slug: 'paper-filters', qty: 1, price: 18 }] } })
    assert.equal(order.status, 201)
    assert.equal(order.data.order.items[0].grind, null, 'Object.prototype was polluted: a kit item got grind "espresso"')
  }
})

test('V7 · the profile update only accepts its own fields', async () => {
  const token = await signIn(AMEL)
  const r = await call('PATCH', '/api/users/me', { token, body: { city: 'Sousse', role: 'admin', email: 'x@example.com', preferences: { grind: 'espresso' } } })
  assert.equal(r.status, 200)
  assert.equal(r.data.user.city, 'Sousse')
  assert.equal(r.data.user.role, 'customer')
  assert.equal(r.data.user.email, AMEL.email)
  await call('PATCH', '/api/users/me', { token, body: { city: 'Tunis' } })
})

// ---------------------------------------------------------------- V8 misconfiguration
test('V8 · another website cannot read the API (no open CORS)', async () => {
  const r = await call('GET', '/api/products', { headers: { origin: 'https://evil.example' } })
  assert.equal(r.headers.get('access-control-allow-origin'), null)
})

test('V8 · errors carry no stack trace or database detail', async () => {
  const r = await call('POST', '/api/auth/login', { raw: '{"email": ' })
  assert.equal(r.status, 400)
  assert.equal(r.data.stack, undefined, 'stack trace in the response')
  assert.equal(r.data.detail, undefined)
  const bad = await call('GET', '/api/orders/not-a-number', { token: await signIn(AMEL) })
  assert.ok(bad.status < 500, `invalid order id answered ${bad.status}`)
  assert.ok(!/postgres|syntax|at .*\.js/i.test(bad.text), 'internal error text in the response')
})

test('V8 · the API does not announce its framework and sets security headers', async () => {
  const r = await call('GET', '/api/health')
  assert.equal(r.headers.get('x-powered-by'), null)
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
})

test('V8 · the shop sets anti-framing and anti-sniffing headers', async () => {
  const r = await call('GET', '/')
  assert.match(r.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/)
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
  assert.ok(r.headers.get('referrer-policy'))
})

// ---------------------------------------------------------------- runtime detection (docs/detection.md)
test('Detection · repeated failed sign-ins on one account are locked out', async () => {
  // A throwaway address, so no real account is locked. With several API replicas each counts its own share:
  // keep trying until one of them reaches the threshold.
  const email = `brute-${Date.now()}@example.com`
  const statuses = []
  for (let i = 0; i < 20 && !statuses.includes(429); i++) {
    statuses.push((await call('POST', '/api/auth/login', { body: { email, password: `guess-${i}` } })).status)
  }
  assert.ok(statuses.includes(429), `never locked out: ${statuses.join(' ')}`)
  assert.ok(statuses.indexOf(429) >= 5, 'locked out before 5 failures')
})
