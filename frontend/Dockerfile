FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json server.mjs ./
RUN npm ci --omit=dev
COPY lib/ ./lib/
COPY scripts/ ./scripts/
COPY public/ ./public/
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/dist/ ./
COPY --from=build --chown=node:node /app/node_modules/ ./node_modules/
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 CMD node -e 'fetch(`http://127.0.0.1:${process.env.PORT || 3000}/healthz`).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
CMD ["node", "server.mjs"]
