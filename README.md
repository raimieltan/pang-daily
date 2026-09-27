# Pang Daily

Next.js/Babylon web application at the repository root, with a NestJS API workspace in `apps/api`. Runtime simulation remains local; durable progression will be implemented through backend domain services in subsequent M3.5 tickets.

## Local setup

Requires Node.js 22.12+ (tested with 22.22), Yarn 1.22.22, and Docker with Compose v2.

```bash
yarn install
cp apps/api/.env.example apps/api/.env
cp apps/api/.env.test.example apps/api/.env.test
yarn db:generate
yarn db:up
yarn db:deploy
yarn db:seed
yarn dev:stack
```

Web: http://localhost:3000. API: http://localhost:3001/api. `dev:stack` waits for PostgreSQL, applies committed migrations, and starts both watch processes; Ctrl+C stops the web/API processes. PostgreSQL remains running. `yarn db:down` stops the development database without deleting its volume.

Existing frontend-only workflow: `yarn dev` (or `yarn dev:web`). API only: `yarn dev:api`. Build both: `yarn build`; API only: `yarn build:api`. Start compiled API: `yarn workspace @pang-daily/api start`.

## Database lifecycle

Run these from the repository root:

```bash
yarn db:generate                      # regenerate Prisma Client; no DB connection required
yarn db:migrate --name describe_change # create AND apply a local migration, then generate client
yarn db:deploy                        # apply committed migrations (also CI/deployment)
yarn db:reset                         # destructive dev reset, migrations, client generation, seed
yarn db:reset --force                 # same reset without a prompt (disposable dev DB only)
yarn db:seed                          # repeatable infrastructure seed
```

Commit `apps/api/prisma/schema.prisma` and generated migration SQL together. Never create tables manually or substitute `db push` for migration history. The initial migration creates a constrained singleton `SchemaVersion` row. No player state is introduced by this foundation ticket. Seed is idempotent and preserves an existing version; game reference definitions still live in game-core.

Prisma generation runs during API build/dev/test and the combined build. Prisma 7 migration commands do not generate the client automatically, so the local migration/reset scripts explicitly generate it. CI/deployment runs `yarn install --frozen-lockfile`, `yarn build:api`, then `yarn db:deploy` with deployment `DATABASE_URL`, before starting the API. Do not run `db:reset` or `db:migrate` against production.

## Environment configuration

API and Prisma load `apps/api/.env` when run through the workspace scripts. Existing shell variables take precedence. Set `API_ENV_FILE` to choose a different file (relative to `apps/api`, or absolute); an explicit missing file fails. There is no fallback from a selected test file to development configuration. Production can supply environment variables directly without a file. Frontend Next.js environment loading remains separate.

API startup validates:

| Variable | Required value |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` |
| `DATABASE_URL` | PostgreSQL connection URL with a database name |
| `API_PORT` | Integer 1–65535 |
| `FRONTEND_ORIGINS` | Comma-separated HTTP(S) origins, no paths/trailing slash/wildcards |
| `SESSION_SECRET` | Optional now; if set, at least 32 characters |

There is no authentication/session implementation in this ticket, so no secret is consumed yet. The identity ticket must require its secret when authentication is introduced. Missing/invalid required variables fail startup with variable names and readable errors, without printing connection URLs or secret values. An unavailable database fails initial connection; a later outage makes readiness fail while liveness remains available.

Compose binds development PostgreSQL to localhost:55432 with a persistent volume. Test PostgreSQL uses localhost:55433 and separate credentials/database with ephemeral storage. Example credentials are for these local containers only.

## Health and checks

```bash
curl http://localhost:3001/api/health/live # 200: process alive
curl http://localhost:3001/api/health      # 200 ready; 503 database unavailable/unmigrated

yarn typecheck
yarn typecheck:api
yarn lint
yarn test
yarn test:api
yarn test:api:integration
```

Readiness returns `{ "status": "ready", "application": "alive", "database": "up" }`, or HTTP 503 with `not_ready`/`down`. Database probes have bounded connection/query timeouts. The API enables credentialed CORS only for configured origins, uses the `/api` prefix, disables the Express identification header, and disconnects Prisma on shutdown.

Integration tests start the isolated test container, apply committed migrations, run seed twice, then exercise Prisma connectivity, health status, CORS, and real database failure recovery. They never read development `.env`: `apps/api/.env.test` is required. Override the file with `API_TEST_ENV_FILE` for CI. Tests require `NODE_ENV=test` and a database name ending in `_test`; use a dedicated disposable PostgreSQL instance. The test runner temporarily renames the metadata table to test failure recovery and restores it afterward; use only a dedicated test database. To recheck migrations from zero, recreate the ephemeral test container with `docker compose rm -sf db-test` then rerun the integration command. Stop the test container with `docker compose stop db-test`.

See [backend conventions](docs/BACKEND.md) and [M3.5](docs/M3.5.md) for the persistence architecture and later scope.
