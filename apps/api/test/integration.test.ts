import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../src/bootstrap';
import { DatabaseService } from '../src/database/database.service';

test('migrated PostgreSQL, liveness, readiness, CORS, and unavailable database', async () => {
  const app = await createApplication();
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const database = app.get(DatabaseService);
    assert.equal((await database.client.schemaVersion.findUniqueOrThrow({ where: { id: 1 } })).version, 5);
    assert.equal((await fetch(`${base}/api/health/live`)).status, 200);
    const ready = await fetch(`${base}/api/health`, { headers: { Origin: 'http://localhost:3000' } });
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: 'ready', application: 'alive', database: 'up' });
    assert.equal(ready.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    const denied = await fetch(`${base}/api/health`, { headers: { Origin: 'https://untrusted.example' } });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    // Revoke schema access in the isolated test database to exercise a real DB error.
    await database.client.$executeRawUnsafe('ALTER TABLE "SchemaVersion" RENAME TO "SchemaVersion_offline"');
    try {
      const unavailable = await fetch(`${base}/api/health`);
      assert.equal(unavailable.status, 503);
      const failure = await unavailable.json();
      assert.equal(failure.status, 'not_ready');
      assert.equal(failure.application, 'alive');
      assert.equal(failure.database, 'down');
      assert.equal(failure.statusCode, 503);
      assert.ok(failure.requestId);
      assert.equal((await fetch(`${base}/api/health/live`)).status, 200);
    } finally {
      await database.client.$executeRawUnsafe('ALTER TABLE "SchemaVersion_offline" RENAME TO "SchemaVersion"');
    }
  } finally { await app.close(); }
});
