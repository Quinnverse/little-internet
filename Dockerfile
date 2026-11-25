# Little Internet: one container serves the editor app, published sites (/@slug/), the webring and the API.
# Node 22.18+ runs the TypeScript server directly (type stripping, no build step for the server).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx vite build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY src/core ./src/core
COPY src/runtime ./src/runtime
COPY --from=build /app/dist ./dist
ENV HOST=0.0.0.0 PORT=8787 DATA_DIR=/data APP_DIR=/app/dist TRUST_PROXY=1
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
USER node
CMD ["node", "server/index.ts"]
