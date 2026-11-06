import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { query } from '../db.js'

export function signToken(user) {
  return jwt.sign({ sub: user.id, name: user.name, email: user.email, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn })
}

function readToken(req) {
  const header = req.get('authorization') ?? ''
  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || !token) return null
  try {
    return jwt.verify(token, config.jwtSecret)
  } catch {
    return null
  }
}

// Attaches req.user when a valid token is present; never rejects.
export function optionalAuth(req, _res, next) {
  req.user = readToken(req)
  next()
}

export function requireAuth(req, res, next) {
  req.user = readToken(req)
  if (!req.user) return res.status(401).json({ error: 'Sign in first.' })
  next()
}

// The role is checked in the database on every admin request, not taken from the token: a token stays valid
// for days, and an account that loses the admin role (or was given it by mistake) loses access at once.
export async function requireAdmin(req, res, next) {
  req.user = readToken(req)
  if (!req.user) return res.status(401).json({ error: 'Sign in first.' })
  const { rows } = await query('SELECT role FROM users WHERE id = $1', [req.user.sub])
  if (rows[0]?.role !== 'admin') return res.status(403).json({ error: 'Admins only.' })
  next()
}
