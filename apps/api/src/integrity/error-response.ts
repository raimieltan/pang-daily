import { HttpException } from '@nestjs/common';
export type ErrorKind = 'validation' | 'authentication' | 'authorization' | 'not_found' | 'conflict' | 'unavailable' | 'internal';
function kind(status: number): ErrorKind {
  if (status === 400 || status === 413 || status === 422) return 'validation';
  if (status === 401) return 'authentication';
  if (status === 403) return 'authorization';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429 || status === 503) return 'unavailable';
  return 'internal';
}
/** Never expose Prisma/SQL errors or unexpected exception messages to clients. */
export function errorResponse(error: unknown, requestId: string) {
  let status = 500;
  let details: Record<string, unknown> = { code: 'INTERNAL_ERROR', message: 'The API could not complete this request. Please retry.' };
  if (error instanceof HttpException) {
    status = error.getStatus();
    const raw = error.getResponse();
    details = raw && typeof raw === 'object' ? { ...raw } : { message: String(raw) };
    if (typeof details.code !== 'string') details.code = status === 400 ? 'INVALID_REQUEST' : status === 404 ? 'NOT_FOUND' : status >= 500 ? 'API_UNAVAILABLE' : 'REQUEST_REJECTED';
  } else if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034', 'P2037'].includes(code)) {
      status = 503; details = { code: 'API_UNAVAILABLE', message: 'The save service is temporarily unavailable. Retry with the same command key.' };
    } else if (['P2002', 'P2003', 'P2004'].includes(code)) {
      status = 409; details = { code: 'INTEGRITY_CONFLICT', message: 'This change conflicts with saved state. Reload your save and retry.' };
    }
  }
  return { status, body: { ...details, kind: kind(status), statusCode: status, requestId } };
}
