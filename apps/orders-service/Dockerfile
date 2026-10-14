# syntax=docker/dockerfile:1.7
# Build from the REPO ROOT:  docker build -f apps/orders-service/Dockerfile -t orders-service .

ARG NODE_VERSION=24
ARG RUSH_VERSION=5.181.0

# ---------- build: install, compile, and produce a pruned deployment with `rush deploy` ----------
FROM node:${NODE_VERSION}-slim AS build
ARG RUSH_VERSION
WORKDIR /repo
RUN npm install -g @microsoft/rush@${RUSH_VERSION}
COPY . .
RUN --mount=type=cache,target=/root/.rush \
    --mount=type=cache,target=/repo/common/temp/pnpm-store \
    rush install --to @org/orders-service \
 && rush build --to @org/orders-service \
 && rush deploy --project @org/orders-service --overwrite

# ---------- runtime: minimal, non-root, production deps only ----------
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps"
WORKDIR /app
COPY --from=build --chown=node:node /repo/common/deploy/ /app/
WORKDIR /app/apps/orders-service
USER node
EXPOSE 3000
# Readiness/liveness are probed by the orchestrator via /health/ready and /health/live.
STOPSIGNAL SIGTERM
CMD ["node", "--require", "./dist/instrumentation.js", "dist/main.js"]
# Migrations run as a separate job with the same image:  docker run ... node dist/migrate.js
