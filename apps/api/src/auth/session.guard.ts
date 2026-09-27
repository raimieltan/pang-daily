import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_CONFIG } from '../config/environment.module';
import type { Environment } from '../config/environment';
import { AuthService, type AuthRequest } from './auth.service';

const PUBLIC = 'publicRoute';
export const Public = () => SetMetadata(PUBLIC, true);
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(API_CONFIG) private readonly config: Environment) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      if (request.headers['x-pang-request'] !== '1' || (origin && !this.config.FRONTEND_ORIGINS.includes(origin))) {
        throw new ForbiddenException({ code: 'REQUEST_ORIGIN_REJECTED', message: 'Request origin or CSRF header is invalid.' });
      }
    }
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const principal = await this.auth.resolve(request);
    if (!principal) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to continue.' });
    request.principal = principal;
    return true;
  }
}
