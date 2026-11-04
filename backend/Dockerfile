FROM node:24-alpine AS build
WORKDIR /app
COPY package.json server.mjs ./
COPY lib/ ./lib/
COPY scripts/ ./scripts/
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/dist/ ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 CMD node -e 'fetch(`http://127.0.0.1:${process.env.PORT || 8080}/healthz`).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
CMD ["node", "server.mjs"]
