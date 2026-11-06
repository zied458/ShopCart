import { Router } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

export const users = Router()

// The only fields a customer may change, with their limits.
const TEXT_FIELDS = { phone: 30, address: 200, city: 80 }
const GRINDS = ['whole', 'filter', 'espresso']

// Updates the signed-in customer's delivery details and preferences.
// V7 fixed: lodash (4.17.11, CVE-2019-10744 and later) is gone. Its deep merge copied the whole request body,
// "constructor.prototype" included, into Object.prototype. The update now reads named fields one by one:
// nothing else in the body is ever copied, so there is nothing to pollute, and one dependency less to patch.
users.patch('/me', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT phone, address, city, preferences FROM users WHERE id = $1', [req.user.sub])
  if (!rows[0]) return res.status(404).json({ error: 'Account not found.' })

  const body = req.body ?? {}
  const next = { ...rows[0], preferences: { ...rows[0].preferences } }
  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    if (!Object.hasOwn(body, field)) continue
    const value = body[field]
    if (typeof value !== 'string' || value.length > max) return res.status(400).json({ error: `${field} must be text of at most ${max} characters.` })
    next[field] = value.trim()
  }
  if (Object.hasOwn(body, 'preferences')) {
    const grind = body.preferences?.grind
    if (grind !== undefined && !GRINDS.includes(grind)) return res.status(400).json({ error: `grind must be one of: ${GRINDS.join(', ')}.` })
    if (grind !== undefined) next.preferences.grind = grind
  }

  const updated = await query(
    'UPDATE users SET phone = $1, address = $2, city = $3, preferences = $4 WHERE id = $5 RETURNING id, name, email, role, phone, address, city, preferences',
    [next.phone, next.address, next.city, JSON.stringify(next.preferences), req.user.sub],
  )
  res.json({ user: updated.rows[0] })
})
