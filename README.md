# NestJS microservice template (Rush monorepo, hexagonal)

Production-grade starting point for NestJS services, implementing the team's
**Node.js Backend Development Standards** (v0.2): TypeScript strict, Node 24, NestJS 11 on Fastify,
Rush + pnpm, hexagonal architecture enforced by lint, PostgreSQL via Drizzle, RabbitMQ via
`@golevelup/nestjs-rabbitmq`, transactional outbox, idempotent consumers, and DLX/DLQ.

The sample bounded context is **orders**: `POST /v1/orders` → risk check (third-party adapter) →
persist order + `OrderCreated` in the outbox (one transaction) → relay publishes to RabbitMQ.
A `PaymentCaptured` consumer marks the order paid, idempotently, and emits `OrderPaid`.

## Quick start

```bash
nvm use                                   # Node 24
npm i -g @microsoft/rush
rush install && rush build

docker compose up -d postgres rabbitmq risk-api-stub
cd apps/orders-service
cp .env.example .env
rushx migrate                             # applies drizzle/*.sql
rushx start:dev                           # http://localhost:3000

curl -XPOST localhost:3000/v1/orders -H 'content-type: application/json' \
  -H 'idempotency-key: demo-key-0001' -H 'x-request-id: demo-1' \
  -d '{"customerId":"c-1","currency":"EUR","lines":[{"sku":"A","quantity":2,"unitPriceMinor":500}]}'
```

The full stack, including the service image, runs with `docker compose --profile app up --build`.

## Repository layout

```
rush.json                          # projects + tags (type/service, bc/orders, ...)
common/config/rush/                # pnpm-lock, pnpm-config (overrides), command-line.json (bulk cmds), deploy.json
common/scripts/check-tags.mjs      # CI: services never depend on services, no cross-BC libs
tsconfig.base.json                 # strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
.github/workflows/                 # ci.yml, security.yml, ai-review.yml (placeholder)
libs/contracts/                    # @org/contracts: RabbitMQ message envelopes (zod), exchanges, routing keys
apps/orders-service/
  Dockerfile                       # multi-stage: rush install/build -> rush deploy -> slim non-root runtime
  drizzle.config.ts, drizzle/      # drizzle-kit config + committed, reviewed SQL migrations
  eslint.config.mjs                # typescript-eslint + eslint-plugin-boundaries layering rules
  .dependency-cruiser.cjs          # whole-graph backstop: cycles, orphans, inward-only, no cross-context
  src/
    main.ts                        # Fastify, correlation id hook, versioning, shutdown hooks
    instrumentation.ts             # OpenTelemetry SDK (loaded with --require, before anything else)
    migrate.ts                     # programmatic migrator (pipeline step / k8s Job)
    app.module.ts                  # composition root
    shared/
      kernel/                      # AppError (code + kind, no HTTP), DomainEvent: pure TS
      infrastructure/
        config/                    # zod env schema; app refuses to boot on invalid config
        logging/                   # nestjs-pino: JSON, redaction, requestId/traceId on every line
        correlation/               # AsyncLocalStorage correlation context
        database/                  # pg Pool + Drizzle providers, closed on shutdown
        messaging/                 # RabbitMQ module, publisher (headers), consumer wrapper, DLX/DLQ
        http/                      # RFC 9457 ProblemDetails filter, ZodValidationPipe
        health/                    # /health/live, /health/ready (terminus: postgres + rabbitmq)
        lifecycle/                 # graceful shutdown: readiness fails first, then drain
    orders/                        # <- one bounded context
      domain/                      # Order aggregate, Money VO, events, errors. NO framework imports
      application/
        ports/inbound/             # use-case interfaces + commands + OrderView
        ports/outbound/            # OrderRepository, UnitOfWork, Outbox, ProcessedMessages, RiskAssessment, Clock, IdGenerator
        ports/tokens.ts            # injection tokens (Symbols)
        use-cases/                 # CreateOrder, GetOrder, MarkOrderPaid (+ unit specs with fakes)
        errors.ts                  # OrderNotFound, ProviderUnavailable, ConcurrencyConflict, ...
      infrastructure/
        http/                      # controller + zod DTOs (DTO -> command, view -> response)
        persistence/               # Drizzle schema (pgSchema 'orders'), mapper, repository, outbox, inbox, UnitOfWork
        messaging/                 # OutboxRelay, PaymentCapturedConsumer
        integrations/risk-api/     # third-party client: timeout + retry w/ backoff + circuit breaker (cockatiel), zod-validated
        system/                    # SystemClock, UUIDv7 generator
      orders.module.ts             # binds tokens -> adapters
  test/
    fakes/in-memory.ts             # in-memory fakes for every outbound port
    integration/*.int-spec.ts      # Testcontainers Postgres: repository, UoW, outbox, idempotency
```

### Layer rules (CI-enforced)

| From → may import | domain | application | infrastructure | shared/kernel | shared/infrastructure |
|---|---|---|---|---|---|
| **domain** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **application** | ✅ | ✅ | ❌ | ✅ | ❌ |
| **infrastructure** | ✅ | ✅ | ✅ | ✅ | ✅ |

On top of that, `no-restricted-imports` bans `@nestjs/*`, `drizzle-orm`, `pg`, `amqplib`, `zod`, and
`process` in `domain/**`. In `application/**` the only allowed Nest imports are `Injectable` and
`Inject` from `@nestjs/common`. `sql.raw()` is banned everywhere. dependency-cruiser also blocks
cycles, orphans, and imports across bounded contexts.

## How the moving parts work

- **Correlation ID.** `X-Request-Id` is accepted if it is safe, otherwise one is generated. It
  becomes Fastify's `req.id`, is echoed in the response, and is stored in AsyncLocalStorage. pino's
  `mixin` adds `requestId` and the OTel `traceId` to every log line. The outbox row stores it, the
  relay sends it as the `x-correlation-id` AMQP header (plus W3C `traceparent`), and consumers
  restore it before calling the use case.
- **Outbox.** Use cases call `uow.run(({ orders, outbox }) => …)`, so the order and its events
  commit atomically. `OutboxRelay` leases rows with `FOR UPDATE SKIP LOCKED` plus `locked_until`,
  which makes it safe with N replicas. It publishes outside the transaction with publisher
  confirms and then marks rows as published. Delivery is at-least-once.
- **Idempotent consumer.** `MarkOrderPaid` inserts `(message_id, consumer)` into
  `processed_messages` in the same transaction as the state change. A duplicate is a no-op, and a
  failure rolls back the dedup mark.
- **Ack/Nack policy** (`consumer-context.ts`):
  - An invalid payload is dead-lettered.
  - `unavailable` and `conflict` errors are requeued once, then dead-lettered.
  - Anything else is dead-lettered.
  - Queues are quorum queues with `x-dead-letter-exchange` set to `orders-service.dlx`, routing to
    `<queue>.dlq`, and `x-delivery-limit` set to 10.
- **HTTP Idempotency-Key.** A unique index on `orders.idempotency_key` backs it. A replay returns
  `200` with the original order and `idempotent-replayed: true`, and concurrent races are resolved.
- **Errors.** Domain and application errors carry `kind`, and one filter maps it to an RFC 9457
  `application/problem+json` response with `code` and `traceId`. Unhandled errors never leak
  details.
- **Third-party calls.** The `RiskAssessment` port is written in our language. The adapter applies
  a timeout per attempt, 3 attempts with exponential backoff and jitter on network errors, 5xx, and
  429, and a consecutive-failure circuit breaker. It sends an idempotency key derived from the
  order id, validates responses with zod, and translates failures to `ProviderUnavailableError`
  (503) or `ProviderContractViolationError` (500, alert).
- **Graceful shutdown.** On SIGTERM, `/health/ready` returns 503, the service waits up to 5 s, and
  then Nest stops HTTP and consumers. The outbox relay finishes its loop, and finally the AMQP
  connection and pg pool close.

## Adding a feature (checklist)

Example: "cancel order".

1. **Domain.** Add `cancel(reason, now)` to `Order`, enforce the invariants, and raise an
   `OrderCancelled` event in `order.events.ts`. Unit-test it in `order.spec.ts` with no mocks.
2. **Contract.** If other services care, add `orderCancelledV1Schema` and a routing key in
   `libs/contracts`. Make additive changes only; a breaking change needs a new `vN` type and key.
3. **Application.**
   - Add `ports/inbound/cancel-order.ts` (interface + command) and a token in `tokens.ts`.
   - Implement `use-cases/cancel-order.service.ts` using only ports.
   - Write a spec with the fakes from `test/fakes`, and add a fake for any new port.
4. **Infrastructure.**
   - Map the new event in `drizzle-outbox.ts`.
   - Add a controller route with a zod DTO that maps to the command.
   - If the schema changes, edit `persistence/schema.ts`, run `rushx db:generate`, review the
     SQL, and commit it. Keep the change expand/contract and backward compatible. Never run
     `drizzle-kit push` against a shared database.
   - New consumer: copy `payment-captured.consumer.ts`, use `queueWithDlq()` and `handleMessage()`,
     and give it its own dedup consumer name.
   - New provider: add an outbound port, implement it under `integrations/<provider>/` with the
     same cockatiel policy, and validate responses with zod.
5. **Composition.** Bind the token → class in `orders.module.ts`.
6. **Tests.** Run `rushx lint && rushx test && rushx test:integration`.

**New bounded context:** create `src/<context>/{domain,application,infrastructure}`, give it its
own `pgSchema('<context>')`, and import its module in `app.module.ts`. Contexts never import each
other; they communicate via HTTP or RabbitMQ only.

**New service:** copy `apps/orders-service`, register it in `rush.json` with tags
`type/service` and `bc/<name>`, then run `rush update`.

## Commands

| Where | Command | What |
|---|---|---|
| root | `rush install` / `rush update` | install (CI) / after changing deps (`rush add -p pkg` inside a project) |
| root | `rush build [--to @org/orders-service]` | incremental build |
| root | `rush lint`, `rush test`, `rush test:cov`, `rush test:integration`, `rush db:check`, `rush format:check` | bulk commands |
| root | `node common/scripts/check-tags.mjs` | Rush tag dependency rules |
| service | `rushx start:dev`, `rushx migrate`, `rushx db:generate` | dev loop |
| service | `TEST_DATABASE_URL=postgres://… rushx test:integration` | integration tests against an existing DB instead of Testcontainers |

## CI/CD (GitHub Actions)

- **`ci.yml`** runs on PRs and on pushes to `main`:
  - `rush install` and `check-tags`.
  - Build, Prettier, lint (ESLint + boundaries + dependency-cruiser), and unit tests with
    coverage thresholds. On PRs these are scoped with `--impacted-by git:origin/main`.
  - Drizzle `check`, plus a check that `generate` produces no diff.
  - Testcontainers integration tests.
  - Docker build and a Trivy image scan (HIGH/CRITICAL with a fix fails; SARIF goes to code
    scanning).
- **`security.yml`** runs on PRs, on `main`, and nightly:
  - CodeQL (`javascript-typescript`, `security-extended`).
  - Dependency review on PRs (fails on high).
  - `rush-pnpm audit --audit-level high` as a blocking gate.
  - A gitleaks secret scan.
- **`ai-review.yml`** is a provider-agnostic placeholder and is skipped by default (see below).

### Secrets and variables

| Name | Type | Required | Used by |
|---|---|---|---|
| `AI_REVIEW_ENABLED` | repo **variable** (`true`) | no | turns on `ai-review.yml` |
| `AI_REVIEW_API_KEY` | repo **secret** | only if AI review enabled | AI reviewer provider key |

Nothing else is needed. CodeQL, dependency review, and SARIF upload use the built-in
`GITHUB_TOKEN`. On a private repo, CodeQL and dependency review need GitHub Advanced Security.

### AI code review (not configured yet)

Pick one when you're ready:

- **CodeRabbit** is a GitHub App, so no workflow is needed. Install the app on the repo and commit
  a `.coderabbit.yaml`, for example `reviews: { profile: assertive, path_instructions: [...] }`,
  pointing it at the layer rules above. You can then delete `ai-review.yml`.
- **An LLM-based action** (OpenAI or Anthropic):
  1. Add the `AI_REVIEW_API_KEY` secret.
  2. Set the `AI_REVIEW_ENABLED=true` variable.
  3. Replace the `Run AI review` step in `ai-review.yml` with the action, passing
     `${{ secrets.AI_REVIEW_API_KEY }}`.

  Without the key the job skips with a notice. It also skips on fork PRs, which don't receive
  secrets.

## Decisions in this template (record as ADRs)

- **NestJS 11 (CommonJS), not 12.** NestJS 12 is ESM-only, and the standards default to CJS
  (🔶 CONFIRM ESM). TypeScript is pinned to 5.9 because ts-jest and decorator metadata are
  proven there.
- **Fastify adapter** (🔶 in standards), **node-postgres (`pg`)** driver, **Jest**, and
  **cockatiel 3** for resilience. cockatiel 3 is CJS; v4 is ESM-only.
- **Rush tags use `/`** (`type/service`, `bc/orders`) because rush.json does not allow `:`.
  Select with `rush build --to tag:bc/orders`.
- **Drizzle columns are snake_case** (`casing: 'snake_case'`). The migrations journal lives in
  the `orders_migrations` schema, because migration 0000 creates the `orders` schema itself.
- **Overrides.** `globalOverrides.fastify ^5.12.2` (in `pnpm-config.json`) patches high
  advisories pulled in by `@nestjs/platform-fastify`. Remove it once Nest ships the newer pin.
- **Not included yet:**
  - OpenAPI generation (`@nestjs/swagger` + zod).
  - Auth and object-level authorization (a TODO is marked in `GetOrderService`).
  - Rate limiting and helmet.
  - Shared `@org/eslint-config`, `@org/tsconfig`, and `@org/testing` projects. Config lives in
    the service for now; extract it when the second service arrives.
  - A RabbitMQ-backed integration test for the relay and consumer. The current integration test
    covers Postgres only.
