import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { errorResponse } from '../src/integrity/error-response';
import { commandHash } from '../src/database/player-command';
import { validateCommand } from '../src/integrity/validation';
import { authenticatedActor } from '../src/integrity/actor';
import type { AuthRequest } from '../src/auth/auth.service';

test('normalized errors distinguish validation/authentication/authorization/not-found/conflict/internal/unavailable', () => {
  for (const [exception, status, kind] of [
    [new BadRequestException('bad JSON'), 400, 'validation'], [new UnauthorizedException(), 401, 'authentication'],
    [new ForbiddenException(), 403, 'authorization'], [new NotFoundException(), 404, 'not_found'],
    [new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Already used' }), 409, 'conflict'],
    [Object.assign(new Error('secret SQL'), { code: 'P2002' }), 409, 'conflict'],
    [Object.assign(new Error('secret connection'), { code: 'P1001' }), 503, 'unavailable'],
    [new Error('secret internals'), 500, 'internal'],
  ] as const) {
    const response = errorResponse(exception, 'test-request');
    assert.equal(response.status, status); assert.equal(response.body.kind, kind);
    assert.equal(response.body.statusCode, status); assert.equal(response.body.requestId, 'test-request');
    assert.ok(!JSON.stringify(response).includes('secret'));
  }
});
test('canonical command hashing is independent of JSON property order', () => {
  assert.equal(commandHash({ type: 'vehicle_repair', vehicleId: 'car', components: ['engine'] }),
    commandHash({ components: ['engine'], vehicleId: 'car', type: 'vehicle_repair' }));
  assert.equal(commandHash({ type: 'vehicle_repair', vehicleId: 'car', components: ['engine', 'tires'] }),
    commandHash({ type: 'vehicle_repair', vehicleId: 'car', components: ['tires', 'engine'] }));
  assert.notEqual(commandHash({ type: 'part_purchase', definitionId: 'a' }), commandHash({ type: 'part_purchase', definitionId: 'b' }));
});
test('authenticated actor cannot come from request/body/header identities', () => {
  const principal = { userId: randomUUID(), username: 'test', sessionHash: 'server-session' };
  assert.equal(authenticatedActor({ principal } as AuthRequest), principal);
  assert.throws(() => authenticatedActor({ body: { playerId: randomUUID() } } as AuthRequest), UnauthorizedException);
});
test('strict DTO/content validation runs before mutation', () => {
  for (const input of [null, { key: 'wrong', action: {} },
    { key: randomUUID(), action: { type: 'part_purchase', definitionId: 'unknown' } },
    { key: randomUUID(), action: { type: 'social_introduce', dialogueId: 'unknown' } },
    { key: randomUUID(), playerId: randomUUID(), action: { type: 'social_introduce', dialogueId: 'casey_intro' } },
    { key: randomUUID(), action: { type: 'set_balance', amount: 1 } },
  ]) assert.throws(() => validateCommand(input), BadRequestException);
});
