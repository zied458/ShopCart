# syntax=docker/dockerfile:1.7
# Tropic Line shop image: build with Node, serve the static files with unprivileged nginx (user 101, port 8080).

# --- 1. Build the static site
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# --- 2. Serve it
FROM nginxinc/nginx-unprivileged:alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e
LABEL org.opencontainers.image.title="tropicline-web" \
      org.opencontainers.image.description="Tropic Line ShopCart storefront" \
      org.opencontainers.image.source="https://github.com/saramseibi/Shopcart"
# Where nginx forwards /api; overridden per environment (Compose service name, Kubernetes service).
ENV API_UPSTREAM=http://api:3000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# Apply Alpine security fixes released after the base image, and drop curl (nothing uses it).
USER root
RUN apk upgrade --no-cache && apk del --no-cache curl
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
