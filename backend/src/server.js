import { app } from './app.js'
import { config } from './config.js'
import { pool } from './db.js'
import { ensureSecuritySchema } from './security.js'

// Fail at start-up, not on the first sign-in, when the signing key is missing.
void config.jwtSecret
// The detection counters' table (shared by every replica) must exist before the first request.
await ensureSecuritySchema()

const server = app.listen(config.port, () => {
  console.log(`Tropic Line API listening on http://localhost:${config.port}`)
})

// Close cleanly when Docker or Kubernetes stops the container.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => pool.end().then(() => process.exit(0)))
  })
}
