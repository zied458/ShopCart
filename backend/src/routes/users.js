import { Router } from 'express'
import _ from 'lodash'
import { query } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

export const users = Router()

// Updates the signed-in customer's delivery details and preferences.
users.patch('/me', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT phone, address, city, preferences FROM users WHERE id = $1', [req.user.sub])
  if (!rows[0]) return res.status(404).json({ error: 'Account not found.' })

  // V7: lodash 4.17.11 is a known-vulnerable version (CVE-2019-10744, prototype pollution in defaultsDeep),
  // and the request body goes straight into it.
  const next = _.defaultsDeep({}, req.body, rows[0])

  const updated = await query(
    'UPDATE users SET phone = $1, address = $2, city = $3, preferences = $4 WHERE id = $5 RETURNING id, name, email, role, phone, address, city, preferences',
    [next.phone, next.address, next.city, JSON.stringify(next.preferences ?? {}), req.user.sub],
  )
  res.json({ user: updated.rows[0] })
})
