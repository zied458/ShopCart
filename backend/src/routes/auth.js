import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'
import { requireAuth, signToken } from '../middleware/auth.js'

export const auth = Router()

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, address: u.address, city: u.city })

auth.post('/register', async (req, res) => {
  const { name, email, password } = req.body ?? {}
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' })
  if (String(password).length < 10) return res.status(400).json({ error: 'Use at least 10 characters for the password.' })

  // V4: the role is read from the request body, so a visitor can register as admin.
  const role = req.body.role ?? 'customer'

  const exists = await query('SELECT 1 FROM users WHERE email = $1', [email])
  if (exists.rowCount) return res.status(409).json({ error: 'An account with this email already exists.' })

  const hash = await bcrypt.hash(password, 10)
  const { rows } = await query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
    [name, email, hash, role],
  )
  res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]) })
})

auth.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email])
  const user = rows[0]
  if (!user || !(await bcrypt.compare(String(password ?? ''), user.password_hash))) {
    return res.status(401).json({ error: 'Email or password is wrong.' })
  }
  res.json({ token: signToken(user), user: publicUser(user) })
})

auth.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.sub])
  if (!rows[0]) return res.status(404).json({ error: 'Account not found.' })
  res.json({ user: publicUser(rows[0]) })
})
