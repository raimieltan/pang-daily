import { createHash } from 'node:crypto';
import type { CommandReceipt } from '@pang-daily/contracts';
import type { Prisma } from '../generated/prisma/client';
import type { DatabaseService } from './database.service';
import { resolvePlayer } from './player-context';
import { validateCommand } from '../integrity/validation';
import { rejectCommand } from '../integrity/errors';
import { databaseErrorClass, logEvent, targetId } from '../observability';

/** Canonicalized DTO keys make semantically identical JSON retry-safe. */
export function commandHash(action: unknown): string {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, field]) => [key, canonical(field)]));
    return value;
  }
  const normalized = action && typeof action === 'object' && 'type' in action && action.type === 'vehicle_repair' && 'components' in action && Array.isArray(action.components)
    ? { ...action, components: [...action.components].sort() } : action;
  return createHash('sha256').update(JSON.stringify(canonical(normalized))).digest('hex');
}
export async function runPlayerCommand(db: DatabaseService, userId: string, input: unknown, requestId: string,
  mutate: (context: { tx: Prisma.TransactionClient; player: Awaited<ReturnType<typeof resolvePlayer>>;
    command: ReturnType<typeof validateCommand> }) => Promise<CommandReceipt>): Promise<CommandReceipt> {
  const command = validateCommand(input);
  let idempotency: 'hit' | 'miss' | 'unknown' = 'unknown';
  let playerId: string | null = null;
  const fields = { requestId, actorId: userId, command: command.action.type,
    targetId: targetId(command.action as Record<string, unknown>) };
  try {
  const receipt = await db.client.$transaction(async tx => {
    const player = await resolvePlayer(tx, userId, true); playerId = player.id;
    const hash = commandHash(command.action);
    const prior = await tx.idempotencyRecord.findUnique({ where: { playerId_scope_key: { playerId, scope: 'player_command', key: command.key } } });
    if (prior) {
      idempotency = 'hit';
      // Records created before canonical hashing used parsed DTO insertion order.
      const legacyHash = createHash('sha256').update(JSON.stringify(command.action)).digest('hex');
      if (prior.requestHash !== hash && prior.requestHash !== legacyHash) rejectCommand('IDEMPOTENCY_CONFLICT', 'This command key was already used for a different action.');
      if (prior.status !== 'succeeded' || !prior.response) rejectCommand('COMMAND_PENDING', 'This command is not yet confirmed. Retry with the same key.');
      return prior.response as unknown as CommandReceipt;
    }
    idempotency = 'miss';
    const receipt = await mutate({ tx, player, command });
    await tx.playerSaveVersion.update({ where: { playerId }, data: { revision: { increment: 1 } } });
    await tx.idempotencyRecord.create({ data: { playerId, scope: 'player_command', key: command.key,
      requestHash: hash, requestId, status: 'succeeded', resourceId: receipt.resourceId, responseStatus: 200,
      response: receipt as unknown as Prisma.InputJsonValue, completedAt: new Date() } });
    return receipt;
  }, { timeout: 15000 });
  logEvent('persistence.command', { ...fields, playerId, idempotency, transaction: 'committed', outcome: 'success' });
  return receipt;
  } catch (error) {
    logEvent('persistence.command', { ...fields, playerId, idempotency, transaction: 'rolled_back', outcome: 'failure',
      ...databaseErrorClass(error), errorCode: error && typeof error === 'object' && 'getResponse' in error && typeof error.getResponse === 'function'
        ? String((error.getResponse() as { code?: string }).code ?? 'REQUEST_REJECTED') : undefined });
    throw error;
  }
}
