# syntax=docker/dockerfile:1.7
# Tropic Line API image: multi-stage, distroless runtime, non-root, no shell, no package manager.

# --- 1. Install production dependencies only
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# --- 2. Runtime: only Node.js and the app
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:b8cec4b2f2126ff7bd034ec9ac207ffb3272667dfdc48376e3b035d3270549ba
LABEL org.opencontainers.image.title="tropicline-api" \
      org.opencontainers.image.description="Tropic Line ShopCart API" \
      org.opencontainers.image.source="https://github.com/saramseibi/Shopcart"
WORKDIR /app
ENV NODE_ENV=production PORT=3000
# Files stay owned by root: user 65532 can read and run the code but not change it.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY db ./db
USER 65532:65532
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["src/server.js"]
