FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json server.mjs ./
COPY lib/ ./lib/
COPY scripts/ ./scripts/
COPY migrations/ ./migrations/
RUN npm run build -- --require-migrations

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/dist/ ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 CMD node -e 'fetch(`http://127.0.0.1:${process.env.PORT || 8080}/healthz`).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
CMD ["node", "server.mjs"]
