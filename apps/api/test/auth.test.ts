import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bootstrapSchema } from '@pang-daily/contracts';
import { createApplication } from '../src/bootstrap';
import { DatabaseService } from '../src/database/database.service';
import { PlayerRepository } from '../src/database/player.repository';
import { starterState } from '../src/player/starter-state';
import { SOCIAL_CONTENT } from '@pang-daily/game-core/social/catalog';

const password = 'test-password-for-fixtures';
const username = (label: string) => `${label}_${randomUUID().slice(0, 8)}`;
test('authentication, atomic initialization, coherent bootstrap and ownership', async t => {
  let app = await createApplication();
  await app.listen(0, '127.0.0.1');
  let base = await app.getUrl();
  const db = app.get(DatabaseService).client;
  async function call(path: string, cookie?: string, method = 'GET', body?: object, origin = 'http://localhost:3000') {
    return fetch(`${base}/api${path}`, { method, headers: { Origin: origin, 'X-Pang-Request': '1',
      ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  }
  async function register(name: string) {
    const response = await call('/auth/register', undefined, 'POST', { username: name, password });
    assert.equal(response.status, 201, await response.clone().text());
    const cookie = response.headers.get('set-cookie')!;
    assert.ok(cookie.includes('HttpOnly'));
    assert.ok(cookie.includes('SameSite=Lax'));
    assert.ok(cookie.includes('Path=/api'));
    assert.ok(!cookie.includes('Secure')); // This application instance runs in test mode.
    const user = (await response.json()).user as { id: string; username: string };
    return { cookie: cookie.split(';')[0], user };
  }
  let a: Awaited<ReturnType<typeof register>>;
  let playerId = '';
  try {
    await t.test('anonymous policy, DTO validation and CSRF protection are explicit', async () => {
      assert.equal((await call('/player/bootstrap')).status, 401);
      assert.equal((await call('/auth/session')).status, 401);
      assert.equal((await call('/health')).status, 200);
      assert.equal((await call('/auth/register', undefined, 'POST', { username: 'bad', password: 'short' })).status, 400);
      assert.equal((await call('/auth/register', undefined, 'POST', { username: 'valid_name', password, playerId: randomUUID() })).status, 400);
      assert.equal((await call('/auth/login', undefined, 'POST', { username: 'someone', password }, 'https://evil.example')).status, 403);
      const noHeader = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'someone', password }) });
      assert.equal(noHeader.status, 403);
    });
    await t.test('register hashes passwords, normalizes usernames and does not initialize twice', async () => {
      const name = username('first');
      a = await register(name.toUpperCase());
      assert.equal(a.user.username, name);
      assert.equal(await db.playerProfile.count({ where: { userId: a.user.id } }), 0);
      const credential = await db.localCredential.findUniqueOrThrow({ where: { userId: a.user.id } });
      assert.notEqual(credential.passwordHash, password);
      assert.match(credential.passwordHash, /^scrypt-v2\$/);
      assert.equal((await call('/auth/register', undefined, 'POST', { username: name, password })).status, 409);
      assert.equal((await call('/auth/login', undefined, 'POST', { username: name, password: 'incorrect-password' })).status, 401);
      assert.equal((await call('/auth/login', undefined, 'POST', { username: username('missing'), password })).status, 401);
    });
    await t.test('concurrent first bootstrap creates exactly one complete starter state', async () => {
      const responses = await Promise.all(Array.from({ length: 6 }, () => call('/player/bootstrap', a.cookie)));
      const saves = [];
      for (const response of responses) { assert.equal(response.status, 200, await response.clone().text()); saves.push(bootstrapSchema.parse(await response.json())); }
      playerId = saves[0].profile.id;
      assert.equal(new Set(saves.map(save => save.profile.id)).size, 1);
      assert.equal(saves[0].economy.balanceCentavos, '500000');
      assert.equal(saves[0].saveVersion, 2);
      assert.equal(saves[0].vehicles[0].definitionId, 'banwa_dalagan_1996');
      assert.ok(saves[0].progression.unlockedLocations.some(unlock => unlock.unlockId === 'hub_access'));
      assert.equal(await db.playerProfile.count({ where: { userId: a.user.id } }), 1);
      assert.equal(await db.wallet.count({ where: { playerId } }), 1);
      assert.equal(await db.inventory.count({ where: { playerId } }), 1);
      assert.equal(await db.vehicle.count({ where: { playerId } }), 1);
      assert.equal(await db.transaction.count({ where: { playerId, kind: 'starting_cash' } }), 1);
      assert.equal(await db.npcRelationship.count({ where: { playerId } }), SOCIAL_CONTENT.npcs.length);
      const body = JSON.stringify(saves[0]);
      for (const forbidden of ['passwordHash', 'tokenHash', 'throttle', 'wheelState', 'cameraState', 'transform']) assert.ok(!body.includes(forbidden));
    });
    await t.test('another player cannot be selected by query, path, or header', async () => {
      const b = await register(username('other'));
      const other = bootstrapSchema.parse(await (await call('/player/bootstrap', b.cookie)).json());
      assert.notEqual(other.profile.id, playerId);
      assert.equal((await call(`/player/bootstrap?playerId=${other.profile.id}`, a.cookie)).status, 403);
      assert.equal((await call(`/player/${other.profile.id}/bootstrap`, a.cookie)).status, 404);
      const spoof = await fetch(`${base}/api/player/bootstrap`, { headers: { Cookie: a.cookie, 'X-Player-Id': other.profile.id } });
      assert.equal(bootstrapSchema.parse(await spoof.json()).profile.id, playerId);
    });
    await t.test('returning bootstrap loads persisted wallet, garage, social and progression state', async () => {
      const first = bootstrapSchema.parse(await (await call('/player/bootstrap', a.cookie)).json());
      await db.$transaction(async tx => {
        await tx.transaction.create({ data: { playerId, sequence: 2n, amountCentavos: 123n, balanceBeforeCentavos: 500000n,
          balanceAfterCentavos: 500123n, kind: 'test_reward', source: 'integration', sourceReference: 'returning', description: 'Fixture reward', requestId: randomUUID() } });
        await tx.wallet.update({ where: { playerId }, data: { balanceCentavos: 500123n, revision: 2n } });
        await tx.vehicle.update({ where: { id: first.vehicles[0].id }, data: { paint: '#123456' } });
        await tx.npcRelationship.update({ where: { playerId_npcId: { playerId, npcId: 'casey' } }, data: { trust: 65, introduced: true } });
        await tx.rivalState.update({ where: { playerId_npcId: { playerId, npcId: 'casey' } }, data: { metAtHub: true } });
        await tx.raceResult.create({ data: { playerId, vehicleId: first.vehicles[0].id, attemptId: 'returning-race', raceDefinitionId: 'barangay_sprint',
          rivalNpcId: 'casey', outcome: 'win', elapsedMs: 30000n, position: 1, completedAt: new Date() } });
        await tx.playerSaveVersion.update({ where: { playerId }, data: { revision: 1n } });
      });
      const loaded = bootstrapSchema.parse(await (await call('/player/bootstrap', a.cookie)).json());
      assert.equal(loaded.economy.balanceCentavos, '500123');
      assert.equal(loaded.vehicles[0].paint, '#123456');
      assert.equal(loaded.social.state.npcs.casey.trust, 65);
      assert.equal(loaded.social.rivals[0].wins, 1);
      assert.equal(loaded.progression.recentRaces[0].attemptId, 'returning-race');
      assert.equal(loaded.revision, '1');
      assert.equal(await db.transaction.count({ where: { playerId, kind: 'starting_cash' } }), 1);
    });
    await t.test('a failed initialization rolls back every starter row and can retry safely', async () => {
      const account = await register(username('rollback'));
      await assert.rejects(app.get(PlayerRepository).bootstrap(account.user.id,
        { ...starterState(account.user.username), startingCentavos: 0n }, randomUUID()), /constraint/i);
      assert.equal(await db.playerProfile.count({ where: { userId: account.user.id } }), 0);
      assert.equal(await db.wallet.count({ where: { player: { userId: account.user.id } } }), 0);
      assert.equal(await db.vehicle.count({ where: { player: { userId: account.user.id } } }), 0);
      assert.equal((await call('/player/bootstrap', account.cookie)).status, 200);
    });
    await t.test('partial and incompatible saves produce recoverable errors without resetting', async () => {
      const account = await register(username('partial'));
      const profile = await db.playerProfile.create({ data: { userId: account.user.id, displayName: 'Incomplete fixture' } });
      const response = await call('/player/bootstrap', account.cookie);
      assert.equal(response.status, 409);
      const error = await response.json();
      assert.equal(error.code, 'PLAYER_STATE_INCOMPLETE');
      assert.equal(error.recovery, 'contact_support');
      assert.ok(error.requestId);
      assert.equal(await db.vehicle.count({ where: { playerId: profile.id } }), 0);
      await db.playerSaveVersion.update({ where: { playerId }, data: { schemaVersion: 1 } });
      try {
        const incompatible = await call('/player/bootstrap', a.cookie);
        assert.equal(incompatible.status, 409);
        assert.equal((await incompatible.json()).code, 'SAVE_VERSION_INCOMPATIBLE');
      } finally { await db.playerSaveVersion.update({ where: { playerId }, data: { schemaVersion: 2 } }); }
    });
    await t.test('expired sessions are rejected', async () => {
      const account = await register(username('expired'));
      await db.authSession.updateMany({ where: { userId: account.user.id }, data: { createdAt: new Date(Date.now() - 100000), expiresAt: new Date(Date.now() - 1000) } });
      assert.equal((await call('/player/bootstrap', account.cookie)).status, 401);
    });
    await t.test('unknown saved content produces an explicit error without replacement', async () => {
      const vehicle = await db.vehicle.findFirstOrThrow({ where: { playerId } });
      await db.vehicle.update({ where: { id: vehicle.id }, data: { definitionId: 'unknown_definition' } });
      try {
        const response = await call('/player/bootstrap', a.cookie);
        assert.equal(response.status, 409);
        assert.equal((await response.json()).code, 'PLAYER_STATE_INVALID');
        assert.equal(await db.vehicle.count({ where: { playerId } }), 1);
      } finally { await db.vehicle.update({ where: { id: vehicle.id }, data: { definitionId: vehicle.definitionId } }); }
    });
    await t.test('sessions survive API restart, rotate on login, and are revoked on logout', async () => {
      await app.close();
      app = await createApplication(); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
      assert.equal((await call('/auth/session', a.cookie)).status, 200);
      const login = await call('/auth/login', a.cookie, 'POST', { username: a.user.username, password });
      assert.equal(login.status, 200);
      const cookie = login.headers.get('set-cookie')!.split(';')[0];
      assert.notEqual(cookie, a.cookie);
      assert.equal((await call('/auth/session', a.cookie)).status, 401);
      assert.equal((await call('/auth/session', cookie)).status, 200);
      const logout = await call('/auth/logout', cookie, 'POST');
      assert.equal(logout.status, 204);
      assert.equal((await call('/auth/session', cookie)).status, 401);
    });
  } finally { await app.close(); }
});
