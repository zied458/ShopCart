// Runtime configuration.
// Vulnerability markers (V1, V2…) refer to docs/vulnerabilities.md.
import { readFileSync } from 'node:fs'

// Secrets are given at runtime, never written in the code (docs/secrets.md).
// NAME_FILE points to a mounted file (Docker or Kubernetes secret); NAME is accepted for local runs.
// A missing or weak secret stops the API at start-up instead of falling back to a default.
function secret(name, { minLength = 16 } = {}) {
  const file = process.env[`${name}_FILE`]
  const value = (file ? readFileSync(file, 'utf8') : process.env[name] ?? '').trim()
  if (value.length < minLength) {
    throw new Error(`${name} is missing or shorter than ${minLength} characters: set ${name}_FILE or ${name}.`)
  }
  return value
}

// Read once, on first use, so a tool that only needs the database (db/init.js) is not given the signing key.
let jwtSecret

export const config = {
  port: Number(process.env.PORT ?? 3000),
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5433),
    database: process.env.DB_NAME ?? 'tropicline',
    user: process.env.DB_USER ?? 'tropicline',
    password: secret('DB_PASSWORD'),
  },
  // V6 fixed: the signing key comes from a runtime secret of at least 256 bits (64 hex characters).
  get jwtSecret() {
    return (jwtSecret ??= secret('JWT_SECRET', { minLength: 64 }))
  },
  jwtExpiresIn: '7d',
  shippingFlat: 7,
  freeShippingFrom: 100,
}
