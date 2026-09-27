import { UnauthorizedException } from '@nestjs/common';
import { SAVE_VERSION, CONTENT_VERSION } from '@pang-daily/contracts';
import type { Prisma } from '../generated/prisma/client';
import { rejectCommand } from '../integrity/errors';

/** Lock before reading active vehicle/version; every write for one player serializes here. */
export async function resolvePlayer(tx: Prisma.TransactionClient, userId: string, lock = false) {
  if (lock) await tx.$queryRaw`SELECT "id" FROM "PlayerProfile" WHERE "userId" = ${userId}::uuid FOR UPDATE`;
  const player = await tx.playerProfile.findUnique({ where: { userId }, include: { saveVersion: true, user: true } });
  if (player?.user.deactivatedAt) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
  if (!player) rejectCommand('PLAYER_NOT_INITIALIZED', 'Load your player save before using this feature.');
  if (player.archivedAt || !player.saveVersion) rejectCommand('PLAYER_STATE_INCOMPLETE', 'Your saved profile is incomplete. Progress has not been reset.', { recovery: 'contact_support' });
  if (player.saveVersion.schemaVersion !== SAVE_VERSION || player.saveVersion.contentVersion !== CONTENT_VERSION) rejectCommand('SAVE_VERSION_INCOMPATIBLE', 'This save needs a compatible game version.', { recovery: 'update_or_migrate' });
  return player;
}
