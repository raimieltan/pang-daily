import { HttpException } from '@nestjs/common';

/** Emit fixed, allowlisted fields only. Never serialize request bodies or exception messages. */
export function logEvent(event: string, fields: Record<string, string | number | boolean | null | undefined>) {
  console.info(JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields }));
}

export function databaseErrorClass(error: unknown): { errorClass: string; databaseCode?: string } {
  if (error instanceof HttpException) return { errorClass: error.getStatus() >= 500 ? 'api_unavailable' : 'domain_rejection' };
  if (!error || typeof error !== 'object' || !('code' in error)) return { errorClass: 'unexpected' };
  const code = String(error.code);
  if (!/^P\d{4}$/.test(code)) return { errorClass: 'unexpected' };
  if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034', 'P2037'].includes(code)) return { errorClass: 'database_unavailable', databaseCode: code };
  if (['P2002', 'P2003', 'P2004'].includes(code)) return { errorClass: 'database_conflict', databaseCode: code };
  return { errorClass: 'database_error', databaseCode: code };
}

/** Content and resource IDs are useful for a failed command; arbitrary DTO fields are not. */
export function targetId(action: Record<string, unknown>): string | null {
  for (const field of ['vehicleId', 'ownedPartId', 'listingId', 'runId', 'attemptId', 'npcId', 'chapterId', 'definitionId', 'dialogueId', 'beatId']) {
    if (typeof action[field] === 'string') return action[field] as string;
  }
  return null;
}
