import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'
import { requireAuth, signToken } from '../middleware/auth.js'
import { isLockedOut, log, loginFailed, loginSucceeded, maskEmail } from '../security.js'

export const auth = Router()

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, address: u.address, city: u.city })

auth.post('/register', async (req, res) => {
  const { name, email, password } = req.body ?? {}
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' })
  if (String(password).length < 10) return res.status(400).json({ error: 'Use at least 10 characters for the password.' })

  // V4 fixed: every new account is a customer. The role is never read from the request; admins are made
  // in the database by an existing admin.
  const role = 'customer'

  const exists = await query('SELECT 1 FROM users WHERE email = $1', [email])
  if (exists.rowCount) return res.status(409).json({ error: 'An account with this email already exists.' })

  const hash = await bcrypt.hash(password, 10)
  const { rows } = await query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
    [name, email, hash, role],
  )
  log('info', 'auth.registered', { requestId: req.id, ip: req.ip, userId: rows[0].id, account: maskEmail(email) })
  res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]) })
})

auth.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  // Detection response: after 5 failures on this account from this address within 5 minutes, sign-in is refused
  // for the rest of the window, even with the right password (docs/detection.md, rule brute_force).
  if (await isLockedOut(req, email)) {
    log('warn', 'auth.locked_out', { requestId: req.id, ip: req.ip, account: maskEmail(email) })
    return res.status(429).set('Retry-After', '300').json({ error: 'Too many failed attempts. Try again in a few minutes.' })
  }
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [String(email ?? '')])
  const user = rows[0]
  if (!user || !(await bcrypt.compare(String(password ?? ''), user.password_hash))) {
    await loginFailed(req, email)
    return res.status(401).json({ error: 'Email or password is wrong.' })
  }
  await loginSucceeded(req, email)
  res.json({ token: signToken(user), user: publicUser(user) })
})

auth.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.sub])
  if (!rows[0]) return res.status(404).json({ error: 'Account not found.' })
  res.json({ user: publicUser(rows[0]) })
})
