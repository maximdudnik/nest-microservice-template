# syntax=docker/dockerfile:1.7
# Build from the REPO ROOT:  docker build -f apps/orders-service/Dockerfile -t orders-service .

ARG NODE_VERSION=24
ARG RUSHJS_VERSION=5.181.0

# ---------- build: install, compile, and produce a pruned deployment with `rush deploy` ----------
FROM node:${NODE_VERSION}-slim AS build
ARG RUSHJS_VERSION
WORKDIR /repo
RUN npm install -g @microsoft/rush@${RUSHJS_VERSION}
COPY . .
RUN --mount=type=cache,target=/root/.rush \
    --mount=type=cache,target=/repo/common/temp/pnpm-store \
    rush install --to @org/orders-service \
 && rush build --to @org/orders-service \
 && rush deploy --project @org/orders-service --overwrite

# ---------- runtime: distroless (no shell, no npm, no package manager), non-root ----------
# node:*-slim ships npm and perl, which carry HIGH CVEs we don't need at runtime.
FROM gcr.io/distroless/nodejs${NODE_VERSION}-debian13:nonroot AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps"
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /repo/common/deploy/ /app/
WORKDIR /app/apps/orders-service
USER nonroot
EXPOSE 3000
STOPSIGNAL SIGTERM
# Image ENTRYPOINT is `node`; readiness/liveness via /health/ready and /health/live.
CMD ["--require", "./dist/instrumentation.js", "dist/main.js"]
# Migrations run as a separate job with the same image:  docker run ... dist/migrate.js
