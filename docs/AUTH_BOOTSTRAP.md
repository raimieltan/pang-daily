# Authentication and canonical player bootstrap

The browser signs in with a username/password and then loads one server-owned profile through `GET /api/player/bootstrap`. There is no anonymous guest save in the main application: unauthenticated bootstrap requests return HTTP 401 and the page shows sign-in/create-account. Health and registration/login are public. All other API routes are protected by a global Nest session guard by default.

## Strategy boundary

`AuthenticationStrategy` has `register` and `authenticate` operations returning a provider-neutral `{ userId, username }` identity. `AuthService` injects the `AUTHENTICATION_STRATEGY` token, currently bound to `PasswordStrategy` through `useExisting`. Credential verification can be replaced through the Nest provider binding without changing sessions, player ownership, bootstrap, or initialization. The current credentials DTO is username/password; a provider with a different sign-in flow can add its DTO/controller while reusing the identity/session boundary.

Username normalization is lowercase ASCII, 3–32 letters/numbers/underscores. Passwords are 8–128 characters and are neither trimmed nor logged. Local credentials have a unique username and one owning user. Salted Node scrypt hashes use a versioned format; current `scrypt-v2` uses N=32768, r=8, p=3, a random 16-byte salt, and a 64-byte derived key. These parameters follow one of the [OWASP scrypt configurations](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). Initial development v1 hashes are verified and upgraded after successful login. Unknown users still perform password derivation, and invalid credentials return one generic error. Basic process-local auth limits apply by IP and normalized username; distributed limiting/password recovery are later auth work.

## Sessions and browser requests

Successful registration/login issues an opaque random 256-bit token in `pang_session`. The cookie is HTTP-only, SameSite=Lax, scoped to `/api`, expires after seven days, and is Secure in production. PostgreSQL stores only an HMAC-SHA256 digest keyed by `SESSION_SECRET`, the owning user, and expiry. Sessions survive API restarts. Login replaces the current browser session; logout revokes it and clears the cookie. Other devices' sessions are independent. Expired sessions are rejected and pruned on sign-in. Deactivated users cannot authenticate or bootstrap. Rotating the session secret invalidates existing cookies.

`SESSION_SECRET` is now required, with at least 32 characters. The sample value is for local setup only; use a random secret in deployment. Generate one with `openssl rand -hex 32` and set it in `apps/api/.env` (or deployment environment), without `NEXT_PUBLIC_` exposure. Existing development/test environment files in this workspace have random secrets already configured.

The web uses a same-origin Next rewrite `/api/:path*` → `${API_INTERNAL_ORIGIN}/api/:path*`. `API_INTERNAL_ORIGIN` defaults to `http://127.0.0.1:3001`; set it in the web environment if API_PORT/host changes. This keeps the token out of JavaScript and supports credentialed requests without a browser-visible API host setting. Production must terminate HTTPS and configure `FRONTEND_ORIGINS` to the actual web origin. Unsafe API methods require `X-Pang-Request: 1`; if an Origin header is present it must match `FRONTEND_ORIGINS`. Browser cross-origin requests need a permitted CORS preflight. Non-browser clients can omit Origin but must send the custom header. No player ID header/query parameter is trusted.

## Routes

| Route | Behavior |
| --- | --- |
| `POST /api/auth/register` | Strict username/password DTO; creates identity/credential and issues a session (201). Player state waits for canonical bootstrap |
| `POST /api/auth/login` | Verifies credentials and issues a replacement browser session (200) |
| `GET /api/auth/session` | Current authenticated identity (200), otherwise 401 |
| `POST /api/auth/logout` | Revokes current session and clears cookie (204) |
| `GET /api/player/bootstrap` | Initializes once if no profile exists, then returns a coherent playable-session DTO |

Duplicate usernames return 409; malformed credential bodies return 400; unsafe origin/header requests return 403; auth limits return 429. Protected responses/errors use `Cache-Control: no-store`. Every response carries `X-Request-Id`, and error bodies contain status/code/message plus request ID (and recovery action for save problems). Unexpected failures return a generic 503 and log an error event/request ID without credentials, cookies, SQL, or connection URLs.

Bootstrap rejects query parameters, including `playerId`, with 403. There is no arbitrary `/player/:id/bootstrap` route. The session's user is resolved through the unique User → PlayerProfile relationship inside the persistence boundary. Downstream domain endpoints must also derive their owner from this identity, never a client-provided owner.

## Atomic starter state and coherent reads

A serializable database transaction locks the authenticated user row, creates a profile only when absent, then loads all aggregate state in the same snapshot. Serialization/initialization races retry up to three times; database uniqueness is the final duplicate guard. An existing partial profile is not treated as a first-time user.

Starter state is derived from shared `src/game-core` content/rules, not prices or balances supplied by the client:

- One profile, save metadata (save version 2/content `m3-content-1`), wallet and inventory.
- PHP 5,000 as 500,000 centavos with exactly one `starting_cash` ledger receipt and wallet revision 1.
- One owned Banwa Dalagan instance, stock appearance, catalog condition, 45 liters of fuel, and owner-checked active vehicle selection.
- Default relationships for the current NPC catalog, scene reputations, crew standing/membership rows, and the initial Casey rival identity.
- Unlocked Iloilo hub and an unstarted Chapter 1 record.

Either the complete initializer commits or every starter row/receipt rolls back. Registering a user separately does not imply a player has already been initialized. A retry after failure can safely initialize again. Wallet/ledger consistency remains enforced by PAN-74 constraints.

The DTO carries `bootstrapVersion`, `saveVersion`, `contentVersion`, revision, profile, wallet summary, owned vehicles/condition/configuration, owned/retired acquisition records and installations, social state and rival summaries, jobs, recent race results, unlocks, and chapters. Money/revisions/milliseconds are decimal strings where they originate as BIGINT. Vehicle and part UUIDs remain separate from content IDs. There are no world transforms, per-frame inputs, wheel/suspension samples, camera state, or animation state. Jobs/social consumed-event history currently supports compatibility with the existing domain sessions; later domain adapters can replace full histories with dedicated aggregate counters/read models.

## Explicit save errors

| Code / HTTP | Recovery |
| --- | --- |
| `AUTH_REQUIRED` / 401 | Sign in again |
| `PLAYER_STATE_INCOMPLETE` / 409 | Required profile/dependent state is missing; preserve data and contact support |
| `SAVE_VERSION_INCOMPATIBLE` / 409 | Deploy a compatible release or run an explicit save migration |
| `PLAYER_STATE_INVALID` / 409 | Invalid catalog/domain state; preserve data and repair through an audited migration/support path |
| `API_UNAVAILABLE` / 503 | Retry after API/database recovery |

The entry screen presents retry/sign-out and a support reference. It never reports a successful load while replacing a failed save with defaults. There is no destructive profile-repair/reset endpoint in this ticket.

The auth migration advances **database compatibility to 3**; player save meaning remains **version 2**. Existing PAN-74 player rows are not rewritten. API readiness requires database version 4. Apply migrations before restarting/serving the new API.

## Client integration and current scope

`packages/contracts` defines deliberate API DTOs and validation, with no Prisma imports. `packages/game-core` compiles the existing pure TypeScript source so the API and web use one content/rules source. API builds generate these shared artifacts before compiling; deployment must include `packages/*/dist` along with `apps/api/dist` and installed workspace dependencies. Rebuild shared packages after changing their source when running the API alone.

`playerApi` handles authentication/bootstrap HTTP calls. `runtimeBootstrap` explicitly translates the DTO into the existing game-domain sessions and retains the definition-to-instance UUID map for future commands. A server wallet checkpoint loads the summary without fabricating a starting-cash receipt or fetching the entire ledger. Money conversion rejects unsafe/inexact values. The existing client represents one instance per vehicle definition and whole-PHP part purchase provenance; unsupported duplicates/fractional purchase history fail explicitly pending the vehicle/inventory adapter ticket.

The main game entry waits for bootstrap before mounting Babylon. Authenticated runtime sessions and social/garage projections use in-memory hydrated state; browser progression storage is not read or written, and development cash/parts grants are disabled on this path. Garage/query selection is limited to owned cars; NPC vehicle templates remain independent world content. Standalone legacy game fixtures can still use the previous local adapters.

Accounts start with a fresh server save and the registration screen states that existing browser progress is not imported. Local legacy saves remain untouched. **Economy and garage writes now use the server adapter described in [ECONOMY_GARAGE.md](ECONOMY_GARAGE.md).** Job/race settlement, purchases, repairs, fuel, owned/installed parts, appearance and active-car selection persist. Social-domain writes remain for the subsequent social ticket.

## Setup and checks

Use the root README's setup/migration commands, then open http://localhost:3000 and create an account. API-only examples:

```bash
curl -c /tmp/pang-cookies -H 'Content-Type: application/json' -H 'X-Pang-Request: 1' \
  -d '{"username":"example_dev_01","password":"example-dev-password"}' \
  http://localhost:3001/api/auth/register
curl -b /tmp/pang-cookies http://localhost:3001/api/player/bootstrap
curl -b /tmp/pang-cookies -H 'X-Pang-Request: 1' -X POST http://localhost:3001/api/auth/logout
```

```bash
yarn test:api                    # environment and password checks
yarn test:api:integration        # isolated PostgreSQL auth/bootstrap/schema checks
yarn test                       # domain/client adapter/UI projections
yarn typecheck
yarn lint
yarn build
# With yarn dev:stack already running and Playwright Chromium installed:
yarn test:auth:browser
```

Integration coverage includes first/returning login, normalized credentials, password hashing, public policy/CSRF validation, six simultaneous initializations, user selection attacks, persisted wallet/garage/social/race projections, forced initializer rollback and safe retry, incomplete/incompatible/corrupt saves, expiry, API restart, cookie rotation and logout. The real browser test creates a disposable local account and verifies game entry, reload identity, sign-out and returning sign-in. The test account is retained in the local database; PostgreSQL test fixtures use unique usernames and are isolated from development data.
