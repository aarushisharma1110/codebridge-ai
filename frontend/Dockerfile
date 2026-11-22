FROM node:22-bookworm-slim AS build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
COPY lang/ /app/lang/
ARG VITE_API_BASE_URL
RUN test -n "$VITE_API_BASE_URL" && npm run build

FROM caddy:2-alpine
COPY --from=build /app/frontend/dist/ /srv/
COPY deploy/Caddyfile /etc/caddy/Caddyfile
