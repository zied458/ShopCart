import jwt from 'jsonwebtoken'
import { config } from '../config.js'

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

// Trusts the role written in the token. With the secret from V6, anyone can mint an admin token.
export function requireAdmin(req, res, next) {
  req.user = readToken(req)
  if (!req.user) return res.status(401).json({ error: 'Sign in first.' })
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only.' })
  next()
}
