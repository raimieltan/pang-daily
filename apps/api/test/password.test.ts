import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrypt } from 'node:crypto';
import { hashPassword, verifyPassword } from '../src/auth/passwords';

test('password hashes are salted, verify exactly, and reject unknown/malformed credentials', async () => {
  const first = await hashPassword('fixture-password');
  const second = await hashPassword('fixture-password');
  assert.notEqual(first, second);
  assert.ok(await verifyPassword('fixture-password', first));
  assert.equal(await verifyPassword('incorrect-password', first), false);
  assert.equal(await verifyPassword('fixture-password', undefined), false);
  assert.equal(await verifyPassword('fixture-password', 'malformed'), false);
});
test('versioned verification permits safe upgrade of initial development hashes', async () => {
  const salt = Buffer.alloc(16, 1);
  const key = await new Promise<Buffer>((resolve, reject) => scrypt('fixture-password', salt, 64, { N: 16384, r: 8, p: 1 },
    (error, value) => error ? reject(error) : resolve(value)));
  assert.ok(await verifyPassword('fixture-password', `scrypt-v1$${salt.toString('hex')}$${key.toString('hex')}`));
});
