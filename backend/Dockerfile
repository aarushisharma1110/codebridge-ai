FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./
COPY lang/ /app/lang/

USER node
EXPOSE 3000
CMD ["node", "server.js"]
