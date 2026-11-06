// Security logging, metrics and runtime detection (docs/detection.md).
//
// Every request and every security event is written to stdout as one JSON line, with the request's correlation
// id. Three rules watch those events over a sliding window and raise an "alert" line when a threshold is reached:
//
//   brute_force       failed sign-ins on one account from one address        5 in 5 min  → the pair is locked out
//   injection_probe   SQL or script injection patterns in request input      3 in 5 min
//   access_probe      requests refused (401/403) or orders not found (404)  10 in 5 min
//
// The sliding windows live in PostgreSQL (table security_events), shared by every API replica: an attacker
// whose requests are spread over several pods is still counted once, and a lockout holds on every pod.
import { query } from './db.js'

const WINDOW_MS = 5 * 60 * 1000

export const RULES = {
  brute_force: { threshold: 5, what: 'repeated failed sign-ins on one account from one address' },
  injection_probe: { threshold: 3, what: 'SQL or script injection patterns in the input' },
  access_probe: { threshold: 10, what: 'many refused requests or unknown order numbers (enumeration)' },
}

// SQL and script injection signatures. A lone apostrophe is not enough (names like O'Brien are valid).
const INJECTION = [
  /\bunion\b[\s\S]{0,40}\bselect\b/i,
  /\bselect\b[\s\S]{0,80}\bfrom\b/i,
  /\b(pg_sleep|sleep|benchmark|waitfor\s+delay)\s*\(/i,
  /information_schema|pg_catalog|pg_shadow/i,
  /['"]\s*(or|and)\s+['"]?\w+['"]?\s*(=|like)/i,
  /;\s*(drop|delete|update|insert|alter|create)\b/i,
  /'\s*--|\/\*[\s\S]*\*\//,
  /<\s*script\b|\bon(error|load|mouseover|focus)\s*=|javascript:/i,
]

export function log(level, event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), level, event, ...fields })}\n`)
}

// ---------------------------------------------------------------- metrics (Prometheus text format)
const counters = new Map()
function inc(name, labels = {}) {
  const key = `${name}${Object.keys(labels).length ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}` : ''}`
  counters.set(key, (counters.get(key) ?? 0) + 1)
}
export function metricsText() {
  const help = {
    tropicline_http_requests_total: 'HTTP requests by status code',
    tropicline_security_events_total: 'Security events by type',
    tropicline_security_alerts_total: 'Alerts raised by detection rule',
  }
  const lines = []
  for (const [name, text] of Object.entries(help)) {
    lines.push(`# HELP ${name} ${text}`, `# TYPE ${name} counter`)
    for (const [key, value] of counters) if (key.startsWith(name)) lines.push(`${key} ${value}`)
  }
  return `${lines.join('\n')}\n`
}

// ---------------------------------------------------------------- sliding windows (shared by all replicas)
export async function ensureSecuritySchema() {
  await query(`CREATE TABLE IF NOT EXISTS security_events (
    id bigserial PRIMARY KEY, rule text NOT NULL, key text NOT NULL, at timestamptz NOT NULL DEFAULT now())`)
  await query('CREATE INDEX IF NOT EXISTS security_events_lookup ON security_events (rule, key, at)')
}
// Records one hit and returns how many hits this rule and key have in the window, this one included.
async function hit(rule, key) {
  const { rows } = await query(
    `WITH added AS (INSERT INTO security_events (rule, key) VALUES ($1, $2) RETURNING at)
     SELECT 1 + count(*)::int AS n FROM security_events
      WHERE rule = $1 AND key = $2 AND at > now() - make_interval(secs => $3)`,
    [rule, key, WINDOW_MS / 1000],
  )
  return rows[0].n
}
async function count(rule, key) {
  const { rows } = await query(
    'SELECT count(*)::int AS n FROM security_events WHERE rule = $1 AND key = $2 AND at > now() - make_interval(secs => $3)',
    [rule, key, WINDOW_MS / 1000],
  )
  return rows[0].n
}
// Old hits are kept one hour (enough for an investigation to start from the alert lines), then deleted.
setInterval(() => {
  query("DELETE FROM security_events WHERE at < now() - interval '1 hour'").catch((err) => log('error', 'security.cleanup_failed', { message: err.message }))
}, 10 * 60_000).unref()

const context = (req) => ({ requestId: req.id, ip: req.ip, userId: req.user?.sub ?? null, method: req.method, path: req.originalUrl.split('?')[0] })
// Only the first letter and the domain of an e-mail address go to the logs.
export const maskEmail = (email) => String(email ?? '').replace(/^(.)[^@]*(@.*)?$/, (_, first, domain = '') => `${first}***${domain}`)

// Records a security event and raises an alert when its rule reaches the threshold (once per window).
export async function securityEvent(req, event, rule, key, details = {}) {
  inc('tropicline_security_events_total', { event })
  log('warn', event, { ...context(req), rule, ...details })
  if (!rule) return
  const n = await hit(rule, key)
  if (n === RULES[rule].threshold) {
    inc('tropicline_security_alerts_total', { rule })
    log('alert', 'security.alert', { ...context(req), rule, description: RULES[rule].what, count: n, windowMinutes: WINDOW_MS / 60000, key, ...details })
  }
}

// ---------------------------------------------------------------- brute force on sign-in
const loginKey = (req, email) => `${req.ip}|${String(email ?? '').toLowerCase()}`
export const isLockedOut = async (req, email) => (await count('brute_force', loginKey(req, email))) >= RULES.brute_force.threshold
export const loginFailed = (req, email) => securityEvent(req, 'auth.login_failed', 'brute_force', loginKey(req, email), { account: maskEmail(email) })
export const loginSucceeded = async (req, email) => {
  await query("DELETE FROM security_events WHERE rule = 'brute_force' AND key = $1", [loginKey(req, email)])
  log('info', 'auth.login_succeeded', { ...context(req), account: maskEmail(email) })
}

// ---------------------------------------------------------------- middleware
// Detection must never break or slow down the request it observes: these events are recorded in the background.
const record = (promise) => promise.catch((err) => log('error', 'security.record_failed', { message: err.message }))

// Looks for injection patterns in the query string and in the text values of a JSON body.
export function inspectInput(req, _res, next) {
  const values = [...Object.values(req.query ?? {}), ...(req.body && typeof req.body === 'object' ? Object.values(req.body) : [])]
  const sample = values.filter((v) => typeof v === 'string').find((v) => INJECTION.some((re) => re.test(v)))
  if (sample !== undefined) record(securityEvent(req, 'attack.injection_attempt', 'injection_probe', req.ip, { sample: sample.slice(0, 200) }))
  next()
}

// One access-log line per request, and refused requests feed the access_probe rule.
export function accessLog(req, res, next) {
  const start = process.hrtime.bigint()
  res.on('finish', () => {
    inc('tropicline_http_requests_total', { status: res.statusCode })
    log('info', 'http.request', { ...context(req), status: res.statusCode, ms: Number((process.hrtime.bigint() - start) / 1_000_000n), userAgent: req.get('user-agent')?.slice(0, 120) })
    // Failed sign-ins are counted by brute_force instead.
    const signIn = req.originalUrl.startsWith('/api/auth/login')
    const probing = !signIn && (res.statusCode === 401 || res.statusCode === 403 || (res.statusCode === 404 && /^\/api\/(orders|admin)\//.test(req.originalUrl)))
    if (probing) record(securityEvent(req, 'authz.denied', 'access_probe', req.ip, { status: res.statusCode }))
  })
  next()
}
