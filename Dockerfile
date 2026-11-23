# Publish service image. Node 22+ for native TS type-stripping (no transpile step).
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
# Only runtime deps are needed by the server (zod + fflate; fflate used by core).
RUN npm install --omit=dev --no-audit --no-fund

COPY server ./server
COPY src ./src

ENV HOST=0.0.0.0
ENV PORT=8788
EXPOSE 8788

CMD ["node", "server/index.mjs"]
