# syntax=docker/dockerfile:1
# MiniGameHub game server. Build from the repository root:
#   docker build -f infra/docker/Dockerfile -t minigamehub-server .

# ---- build: install workspace deps and bundle the server into one file ----------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci --workspace @minigamehub/server --include-workspace-root --ignore-scripts \
 && npm run build -w @minigamehub/server

# ---- runtime: the bundle is self-contained (no node_modules), runs as a non-root user -------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=2567 \
    HOST=0.0.0.0 \
    MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/server/dist/ /app/
USER node
EXPOSE 2567
HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||2567)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# SIGTERM triggers Colyseus' graceful shutdown (rooms are told, DB pool is closed).
STOPSIGNAL SIGTERM
CMD ["node", "--enable-source-maps", "main.js"]
