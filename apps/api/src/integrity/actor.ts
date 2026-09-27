import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { AuthRequest, Principal } from '../auth/auth.service';

export function authenticatedActor(request: AuthRequest): Principal {
  if (!request.principal) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
  return request.principal;
}
/** SessionGuard is the sole identity source; no actor/player ID is accepted from a DTO. */
export const Actor = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  authenticatedActor(context.switchToHttp().getRequest<AuthRequest>()));
