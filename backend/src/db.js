import pg from 'pg'
import { config } from './config.js'

// Return NUMERIC columns (prices) as JavaScript numbers.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)))

export const pool = new pg.Pool({ ...config.db, max: 10 })

export function query(text, params) {
  return pool.query(text, params)
}
