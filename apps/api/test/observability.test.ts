import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseErrorClass, targetId } from '../src/observability';
import { ConflictException } from '@nestjs/common';

test('database error logging exposes only a safe class and code', () => {
  const error = { name: 'PrismaClientKnownRequestError', code: 'P1001', message: 'password=secret postgresql://user:secret@db' };
  assert.deepEqual(databaseErrorClass(error), { errorClass: 'database_unavailable', databaseCode: 'P1001' });
  assert.equal(JSON.stringify(databaseErrorClass(error)).includes('secret'), false);
  assert.deepEqual(databaseErrorClass(new Error('postgresql://user:secret@db')), { errorClass: 'unexpected' });
  assert.deepEqual(databaseErrorClass(new ConflictException('rejected')), { errorClass: 'domain_rejection' });
});

test('mutation target is selected from known identifiers only', () => {
  assert.equal(targetId({ type: 'vehicle_repair', vehicleId: 'car-1', password: 'secret' }), 'car-1');
  assert.equal(targetId({ type: 'social_choice', dialogueId: 'casey_intro', token: 'secret' }), 'casey_intro');
  assert.equal(targetId({ type: 'unknown', token: 'secret' }), null);
});
