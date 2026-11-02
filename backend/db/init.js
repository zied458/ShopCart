// Recreates the schema and loads test data. Run with: npm run db:init
// Every account below is a TEST account for the local lab; none of these passwords is real.
import { readFile } from 'node:fs/promises'
import bcrypt from 'bcryptjs'
import { pool } from '../src/db.js'

const here = new URL('.', import.meta.url)
const schema = await readFile(new URL('schema.sql', here), 'utf8')
const catalog = JSON.parse(await readFile(new URL('catalog.json', here), 'utf8'))

const users = [
  { name: 'Yasmine Haddad', email: 'admin@tropicline.local', password: 'Admin-Tropic-2026', role: 'admin', phone: '71 000 000', address: 'Roastery, 12 rue de la Torréfaction', city: 'Tunis' },
  { name: 'Amel Trabelsi', email: 'amel.t@example.com', password: 'Customer-2026', role: 'customer', phone: '22 410 118', address: '14 rue Ibn Khaldoun', city: 'La Marsa, Tunis' },
  { name: 'Karim Ben Ali', email: 'karim.b@example.com', password: 'Customer-2026', role: 'customer', phone: '98 201 554', address: '3 avenue Habib Bourguiba', city: 'Sousse' },
  { name: 'Sana Mejri', email: 'sana.m@example.com', password: 'Customer-2026', role: 'customer', phone: '55 900 312', address: '27 rue de Marseille', city: 'Tunis' },
  { name: 'Youssef Hamdi', email: 'youssef.h@example.com', password: 'Customer-2026', role: 'customer', phone: '24 776 090', address: '8 rue du Lac Biwa', city: 'Les Berges du Lac, Tunis' },
]

// [email, days ago, status, [[slug, grind, qty], …]]
const orders = [
  ['amel.t@example.com', 14, 'Delivered', [['guatemala-antigua', 'whole', 2]]],
  ['youssef.h@example.com', 7, 'Posted', [['kenya-nyeri', 'filter', 1], ['hand-grinder', null, 1]]],
  ['sana.m@example.com', 3, 'Roasting Tuesday', [['colombia-huila', 'whole', 1], ['brazil-cerrado', 'whole', 2]]],
  ['karim.b@example.com', 2, 'Roasting Tuesday', [['india-monsooned-malabar', 'espresso', 3]]],
  ['amel.t@example.com', 1, 'Roasting Tuesday', [['ethiopia-yirgacheffe', 'filter', 2], ['paper-filters', null, 1]]],
]

const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query(schema)

  const productIds = {}
  const prices = {}
  for (const p of catalog) {
    const { rows } = await client.query(
      `INSERT INTO products (slug, kind, name, country, region, latitude, altitude, process, variety, harvest, notes, story, detail, price, stock, bag, image, image_alt, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [p.slug, p.kind, p.name, p.country, p.region, p.latitude, p.altitude, p.process, p.variety, p.harvest, p.notes, p.story, p.detail, p.price, p.stock, p.bag, p.image, p.image_alt, p.position],
    )
    productIds[p.slug] = rows[0].id
    prices[p.slug] = p.price
  }

  const userIds = {}
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10)
    const { rows } = await client.query(
      'INSERT INTO users (name, email, password_hash, role, phone, address, city) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [u.name, u.email, hash, u.role, u.phone, u.address, u.city],
    )
    userIds[u.email] = { id: rows[0].id, ...u }
  }

  for (const [email, daysAgo, status, lines] of orders) {
    const u = userIds[email]
    const subtotal = lines.reduce((n, [slug, , qty]) => n + prices[slug] * qty, 0)
    const shipping = subtotal >= 100 ? 0 : 7
    const { rows } = await client.query(
      `INSERT INTO orders (user_id, email, name, phone, address, city, subtotal, shipping, total, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() - make_interval(days => $11)) RETURNING id`,
      [u.id, email, u.name, u.phone, u.address, u.city, subtotal, shipping, subtotal + shipping, status, daysAgo],
    )
    for (const [slug, grind, qty] of lines) {
      await client.query('INSERT INTO order_items (order_id, product_id, grind, qty, unit_price) VALUES ($1,$2,$3,$4,$5)', [rows[0].id, productIds[slug], grind, qty, prices[slug]])
    }
  }

  await client.query('COMMIT')
  console.log(`Database ready: ${catalog.length} products, ${users.length} users, ${orders.length} orders.`)
} catch (err) {
  await client.query('ROLLBACK')
  console.error('Database init failed:', err.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
