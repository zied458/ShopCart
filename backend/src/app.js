import express from 'express'
import cors from 'cors'
import { query } from './db.js'
import { auth } from './routes/auth.js'
import { products } from './routes/products.js'
import { orders } from './routes/orders.js'
import { users } from './routes/users.js'
import { admin } from './routes/admin.js'

export const app = express()

// V8: CORS accepts every origin, no security headers are set, and Express announces itself (X-Powered-By).
app.use(cors())
app.use(express.json({ limit: '100kb' }))

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

// V8: errors are sent back with their message and stack trace, including raw database errors.
app.use((err, _req, res, _next) => {
  const status = err.status ?? 500
  res.status(status).json({ error: err.message, detail: err.detail, stack: err.stack })
})
