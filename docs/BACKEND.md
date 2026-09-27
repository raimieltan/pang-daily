# Backend conventions

`apps/api` is a Yarn workspace. The web remains at the repository root to preserve existing assets, aliases, and game workflows. API TypeScript uses its own compiler configuration and output; the web compiler excludes it. API generated code and build output are ignored by Git and ESLint.

`main.ts` loads/validates configuration and starts the app. `bootstrap.ts` owns HTTP bootstrap settings. Neither contains domain persistence. `EnvironmentModule` exposes typed configuration through `API_CONFIG`. `DatabaseModule` exports one lifecycle-managed `DatabaseService`; consumers explicitly import the module. `HealthModule` uses this service for readiness.

Future domain modules group controllers, DTO validation, domain services, and persistence repositories by capability. Controllers translate HTTP requests and return deliberate DTOs; domain services validate commands/ownership and own transactional operations. Prisma imports belong only in database/persistence services, never generic utilities, controllers, client features, or bootstrap. Current ESLint rules restrict Prisma imports to the database directory. When introducing domain repository directories, add narrowly scoped lint exceptions for those files rather than disabling the boundary globally.

The dependency direction is HTTP controller → domain service → persistence service → Prisma/PostgreSQL. Backend modules must not import React, Zustand state, browser storage, or Babylon runtime code. Pure deterministic game-core calculations can be shared when the module has no browser/runtime dependencies. Client features consume an API adapter and explicit DTOs, never Prisma-generated objects. Do not expose database credentials through `NEXT_PUBLIC_*` variables.

The relational schema and migration rules are defined in [PAN-74](PAN-74_SCHEMA.md), including player ownership, exact money, vehicles/parts, progression, social state, and duplicate protection. Authentication and canonical bootstrap are implemented as described in [AUTH_BOOTSTRAP.md](AUTH_BOOTSTRAP.md). Later tickets implement gameplay domain mutations over this schema. Do not add a generic save JSON blob, temporary player-state table, or frame-level simulation persistence.

A global session guard protects API routes by default; public routes explicitly opt out. Authentication uses an injectable strategy, and auth/player repositories keep Prisma in the database boundary. Shared contracts and pure game-core builds live in `packages/`. Gameplay mutation DTOs, richer request logging, and persistence adapters for the remaining domains belong to their feature/hardening tickets.

Economy and garage writes use authenticated domain commands and per-player transactional locking. See [ECONOMY_GARAGE.md](ECONOMY_GARAGE.md) for commands, currency, idempotency and local simulation boundaries. Database compatibility is 4; player save version remains 2.
