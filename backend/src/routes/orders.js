import { Router } from 'express'
import { pool, query } from '../db.js'
import { config } from '../config.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'

export const orders = Router()

const GRINDS = ['whole', 'filter', 'espresso']

async function loadOrder(id) {
  const { rows } = await query('SELECT * FROM orders WHERE id = $1', [id])
  if (!rows[0]) return null
  const items = await query(
    `SELECT p.slug, p.name, p.kind, p.country, i.grind, i.qty, i.unit_price
       FROM order_items i JOIN products p ON p.id = i.product_id WHERE i.order_id = $1 ORDER BY i.id`,
    [id],
  )
  return { ...rows[0], items: items.rows }
}

// Guests can order too; a signed-in customer's order is linked to their account.
orders.post('/', optionalAuth, async (req, res) => {
  const { email, name, phone, address, city, items } = req.body ?? {}
  if (!email || !name || !phone || !address || !city) return res.status(400).json({ error: 'Contact and delivery details are required.' })
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'The cart is empty.' })
  if (items.length > 30) return res.status(400).json({ error: 'Too many lines in one order.' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const lines = []
    for (const item of items) {
      const qty = Number.parseInt(item.qty, 10)
      if (!(qty >= 1 && qty <= 20)) throw Object.assign(new Error('Each line needs between 1 and 20 bags.'), { status: 400 })
      // FOR UPDATE locks the product row until the order is saved, so two orders cannot sell the same last bag.
      const { rows } = await client.query('SELECT id, kind, stock, price FROM products WHERE slug = $1 FOR UPDATE', [String(item.slug)])
      if (!rows[0]) throw Object.assign(new Error(`Unknown product ${item.slug}.`), { status: 400 })
      if (rows[0].stock < qty) throw Object.assign(new Error(`Only ${rows[0].stock} left of ${item.slug}.`), { status: 409 })
      // V2 fixed: the unit price is read from the products table. Any price sent by the browser is ignored.
      const grind = rows[0].kind === 'coffee' && GRINDS.includes(item.grind) ? item.grind : null
      lines.push({ productId: rows[0].id, grind, qty, unitPrice: rows[0].price })
    }
    const subtotal = lines.reduce((n, l) => n + l.unitPrice * l.qty, 0)
    const shipping = subtotal >= config.freeShippingFrom ? 0 : config.shippingFlat
    const { rows } = await client.query(
      `INSERT INTO orders (user_id, email, name, phone, address, city, subtotal, shipping, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [req.user?.sub ?? null, email, name, phone, address, city, subtotal, shipping, subtotal + shipping],
    )
    for (const l of lines) {
      await client.query('INSERT INTO order_items (order_id, product_id, grind, qty, unit_price) VALUES ($1,$2,$3,$4,$5)', [rows[0].id, l.productId, l.grind, l.qty, l.unitPrice])
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [l.qty, l.productId])
    }
    // Keep the delivery details on the account for next time.
    if (req.user) await client.query('UPDATE users SET phone = $1, address = $2, city = $3 WHERE id = $4', [phone, address, city, req.user.sub])
    await client.query('COMMIT')
    res.status(201).json({ order: await loadOrder(rows[0].id) })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

orders.get('/mine', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT id FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [req.user.sub])
  res.json({ orders: await Promise.all(rows.map((r) => loadOrder(r.id))) })
})

// V3: any signed-in user can read any order by its number (IDOR), including name, phone and address.
orders.get('/:id', requireAuth, async (req, res) => {
  const order = await loadOrder(Number(req.params.id))
  if (!order) return res.status(404).json({ error: 'No such order.' })
  res.json({ order })
})
