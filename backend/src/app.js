import express from 'express'
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { auth } from './routes/auth.js'
import { products } from './routes/products.js'
import { orders } from './routes/orders.js'
import { users } from './routes/users.js'
import { admin } from './routes/admin.js'
import { accessLog, inspectInput, log, metricsText } from './security.js'

export const app = express()

// V8 fixed (1/3): no framework banner, and no CORS at all. The shop and the API share one origin (nginx
// forwards /api/), so no other website ever needs to read the API; without CORS headers, browsers refuse.
app.disable('x-powered-by')
// nginx is the one proxy in front of the API: req.ip is the address nginx saw (the last X-Forwarded-For entry),
// which a client cannot forge by sending its own X-Forwarded-For.
app.set('trust proxy', 1)

// Every request gets a correlation id: the one nginx sends (X-Request-Id), or a new one. It is returned to the
// client and written in the logs, so a support message ("error ref …") leads straight to the log line.
app.use((req, res, next) => {
  req.id = /^[\w-]{8,64}$/.test(req.get('x-request-id') ?? '') ? req.get('x-request-id') : randomUUID()
  res.set({
    'X-Request-Id': req.id,
    // V8 fixed (2/3): security headers on every API response, also when the API is reached without nginx.
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  })
  next()
})

app.use(accessLog)
app.use(express.json({ limit: '100kb' }))
app.use('/api', inspectInput)

// Metrics for monitoring (Prometheus text format). Not under /api/, so nginx never exposes it: only reachable
// inside the cluster (or with kubectl port-forward).
app.get('/metrics', (_req, res) => res.type('text/plain; version=0.0.4').send(metricsText()))

app.get('/api/health', async (_req, res) => {
  await query('SELECT 1')
  res.json({ status: 'ok' })
})

app.use('/api/auth', auth)
app.use('/api/products', products)
app.use('/api/orders', orders)
app.use('/api/users', users)
app.use('/api/admin', admin)

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }))

// V8 fixed (3/3): the client gets a short message and the correlation id; the details (message, database
// detail, stack trace) go only to the server log, as one JSON line.
app.use((err, req, res, _next) => {
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500
  if (status >= 500) {
    log('error', 'http.error', { requestId: req.id, method: req.method, path: req.originalUrl.split('?')[0], message: err.message, code: err.code, stack: err.stack })
  }
  // Our own 4xx errors carry a message written for the customer; anything else is described generically.
  const message =
    err.type === 'entity.parse.failed' ? 'The request body is not valid JSON.'
    : err.type === 'entity.too.large' ? 'The request body is too large.'
    : status < 500 && !err.type ? err.message
    : 'Something went wrong on our side.'
  res.status(status).json({ error: message, requestId: req.id })
})
