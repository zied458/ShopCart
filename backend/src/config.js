// Runtime configuration.
// Vulnerability markers (V1, V2…) refer to docs/vulnerabilities.md.

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://tropicline:***@localhost:5433/tropicline',
  // V6: the token signing secret is hardcoded and committed with the code.
  jwtSecret: process.env.JWT_SECRET ?? '***',
  jwtExpiresIn: '7d',
  shippingFlat: 7,
  freeShippingFrom: 100,
}
