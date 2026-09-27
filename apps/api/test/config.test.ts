import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { validateEnvironment } from '../src/config/environment';

const valid = { SESSION_SECRET: 'test-secret-at-least-32-characters-long', NODE_ENV: 'test', API_PORT: '3002', DATABASE_URL: 'postgresql://test:test@localhost:55433/pang_daily_test', FRONTEND_ORIGINS: 'http://localhost:3000,https://example.com' };
test('valid configuration is typed and comma separated origins are parsed', () => {
  const result = validateEnvironment(valid);
  assert.equal(result.API_PORT, 3002);
  assert.equal(result.DB_POOL_MAX, 5);
  assert.deepEqual(result.FRONTEND_ORIGINS, ['http://localhost:3000', 'https://example.com']);
});
test('missing configuration names each required variable', () => {
  assert.throws(() => validateEnvironment({}), (error: unknown) => {
    assert.ok(error instanceof Error);
    for (const key of ['NODE_ENV', 'DATABASE_URL', 'API_PORT', 'FRONTEND_ORIGINS', 'SESSION_SECRET']) assert.ok(error.message.includes(key));
    return true;
  });
});
test('invalid settings and short secrets fail without exposing values', () => {
  for (const [key, value] of Object.entries({ NODE_ENV: 'staging', DATABASE_URL: 'https://secret.example.com/db',
    API_PORT: '65536', FRONTEND_ORIGINS: '*', SESSION_SECRET: 'sensitive-secret' })) {
    assert.throws(() => validateEnvironment({ ...valid, [key]: value }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes(key));
      assert.ok(!error.message.includes(value));
      return true;
    });
  }
});
test('rejects empty, fractional ports and origins with paths', () => {
  for (const API_PORT of ['', '0', '3001.5', 'abc']) assert.throws(() => validateEnvironment({ ...valid, API_PORT }));
  for (const DB_POOL_MAX of ['0', '21', '2.5']) assert.throws(() => validateEnvironment({ ...valid, DB_POOL_MAX }));
  for (const FRONTEND_ORIGINS of ['', 'http://localhost:3000/', 'https://example.com/path']) {
    assert.throws(() => validateEnvironment({ ...valid, FRONTEND_ORIGINS }));
  }
});

test('API process exits with explicit configuration errors before connecting', () => {
  const result = spawnSync(process.execPath, [resolve('dist/src/main.js')], {
    cwd: '/tmp', env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('Invalid API configuration:'));
  assert.ok(result.stderr.includes('DATABASE_URL'));
  assert.ok(result.stderr.includes('API_PORT'));
});
