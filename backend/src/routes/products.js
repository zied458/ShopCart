import { Router } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

export const products = Router()

const COLUMNS = 'id, slug, kind, name, country, region, latitude, altitude, process, variety, harvest, notes, story, detail, price, stock, bag, image, image_alt'

products.get('/', async (req, res) => {
  const search = String(req.query.search ?? '').slice(0, 100)
  // The sort order is chosen from a fixed list: it is never built from the request.
  const sort = req.query.sort === 'price' ? 'price ASC' : 'position ASC'

  // V1 fixed: the search text is sent to PostgreSQL as a parameter ($1), separately from the SQL, so it is
  // always data and never code. % and _ are escaped so they are matched literally, not as wildcards.
  const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM products
      WHERE name ILIKE $1 OR country ILIKE $1 OR region ILIKE $1 OR array_to_string(notes, ' ') ILIKE $1
      ORDER BY ${sort}`,
    [pattern],
  )
  res.json({ products: rows })
})

products.get('/:slug', async (req, res) => {
  const { rows } = await query(`SELECT ${COLUMNS} FROM products WHERE slug = $1`, [req.params.slug])
  if (!rows[0]) return res.status(404).json({ error: 'No such product.' })
  res.json({ product: rows[0] })
})

products.get('/:slug/reviews', async (req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.rating, r.body, r.created_at, u.name AS author
       FROM reviews r JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id
      WHERE p.slug = $1 ORDER BY r.created_at DESC`,
    [req.params.slug],
  )
  res.json({ reviews: rows })
})

products.post('/:slug/reviews', requireAuth, async (req, res) => {
  const rating = Number(req.body?.rating)
  // V5: the review text is stored as sent, HTML included; the shop renders it as HTML (stored XSS).
  const body = String(req.body?.body ?? '').trim()
  if (!body || !(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'A rating from 1 to 5 and a review are required.' })
  const product = await query('SELECT id FROM products WHERE slug = $1', [req.params.slug])
  if (!product.rows[0]) return res.status(404).json({ error: 'No such product.' })
  const { rows } = await query(
    'INSERT INTO reviews (product_id, user_id, rating, body) VALUES ($1, $2, $3, $4) RETURNING id, rating, body, created_at',
    [product.rows[0].id, req.user.sub, rating, body],
  )
  res.status(201).json({ review: { ...rows[0], author: req.user.name } })
})
