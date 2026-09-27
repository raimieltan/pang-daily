# Client persistence

`playerService` is the application boundary. It loads one aggregate bootstrap,
translates transport DTOs, hydrates `usePlayerMetaStore`, and supplies a domain
persistence factory to Babylon. `playerApi` owns HTTP/auth details;
`ServerPersistence` owns serialization, instance-ID resolution, idempotency and
confirmed snapshot application. Neither gameplay nor the engine imports backend
contracts or Prisma types. The old game persistence module is a compatibility
export for existing consumers/tests.

Feature code uses domain sessions (e.g. inventory installation, vehicle repair,
job progression, dialogue choices) and the bridge. Those sessions submit domain
intents through `PersistencePort`. They must not mutate money or ownership locally
in an authenticated session. A mutation resolves successfully only after the
server command and refreshed bootstrap both succeed. Errors stay visible, including
when a later idle checkpoint does no work. Known failed commands require the player
to repeat the action; uncertain commands can be recovered using Retry save.

Each uncertain command retains its UUID idempotency key. Duplicate simultaneous
intents share a promise. A lost response repeats the same key; a receipt followed
by failed hydration retries only bootstrap. Definitive client errors drop the
pending command so background checkpoints cannot purchase something later without
another player action. Keys and receipts are session memory, not a persistent
outbox: closing a tab loses them, and reload reads the server's actual result.
No offline command is presented as saved.

Canonical meta is an in-memory read model: money, ownership, inventory, condition,
jobs, social state (relationships/reputation/crew/rivals), chapter markers, race
history and unlocks come from bootstrap. Lower revisions cannot replace a newer
snapshot. Sign-out clears meta and invalidates hydration from the previous session.
Reload always fetches bootstrap; old browser progression is never imported.

Authenticated runtime storage is an isolated memory map used for reconstructable
presentation/active-car selection. Existing sessionStorage progression loaders
remain available only for unauthenticated development fixtures. Audio preferences
and other presentation settings remain browser-local. Physics/input/camera/modal
state stays transient. Driving may accumulate wear while a request is pending;
the adapter applies only that additional loss over confirmed condition, then
checkpoints it periodically. A closed/offline tab can lose unconfirmed simulation
wear. Browser caches never upload snapshots or overwrite canonical progression.

Browser save retirement follows the explicit reset policy in
[Browser save transition](../../../docs/BROWSER_SAVE_TRANSITION.md). Legacy keys
are detected and retired only after successful hydration, with a durable marker
written before cleanup and recoverable storage failures. No browser import occurs.
