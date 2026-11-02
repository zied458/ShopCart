import { Router } from 'express'
import { query } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

export const admin = Router()
admin.use(requireAdmin)

const STATUSES = ['Roasting Tuesday', 'Posted', 'Delivered', 'Cancelled']

admin.get('/orders', async (_req, res) => {
  const { rows } = await query(
    `SELECT o.*, COALESCE(json_agg(json_build_object('slug', p.slug, 'name', p.name, 'kind', p.kind, 'country', p.country, 'grind', i.grind, 'qty', i.qty, 'unit_price', i.unit_price) ORDER BY i.id), '[]') AS items
       FROM orders o JOIN order_items i ON i.order_id = o.id JOIN products p ON p.id = i.product_id
      GROUP BY o.id ORDER BY o.created_at DESC`,
  )
  res.json({ orders: rows })
})

admin.patch('/orders/:id', async (req, res) => {
  const status = req.body?.status
  if (!STATUSES.includes(status)) return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}.` })
  const { rows } = await query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING id, status', [status, req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'No such order.' })
  res.json({ order: rows[0] })
})

admin.patch('/products/:slug', async (req, res) => {
  const price = Number(req.body?.price)
  const stock = Number.parseInt(req.body?.stock, 10)
  if (!(price >= 0) || !(stock >= 0)) return res.status(400).json({ error: 'Price and stock must be zero or more.' })
  const { rows } = await query('UPDATE products SET price = $1, stock = $2 WHERE slug = $3 RETURNING slug, price, stock', [price, stock, req.params.slug])
  if (!rows[0]) return res.status(404).json({ error: 'No such product.' })
  res.json({ product: rows[0] })
})

admin.get('/customers', async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.city, u.role, u.created_at,
            COUNT(o.id)::int AS orders, COALESCE(SUM(o.total), 0) AS spent, MAX(o.created_at) AS last_order
       FROM users u LEFT JOIN orders o ON o.user_id = u.id
      GROUP BY u.id ORDER BY spent DESC, u.created_at DESC`,
  )
  res.json({ customers: rows })
})
