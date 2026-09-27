import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { credentialsSchema } from '@pang-daily/contracts';
import { API_CONFIG } from '../config/environment.module';
import type { Environment } from '../config/environment';
import { AuthService, SESSION_COOKIE, SESSION_SECONDS, type AuthRequest } from './auth.service';
import { AuthRateLimiter } from './auth-rate-limiter';
import { Public } from './session.guard';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(AuthRateLimiter) private readonly limiter: AuthRateLimiter,
    @Inject(API_CONFIG) private readonly config: Environment) {}
  private async signIn(body: unknown, register: boolean, request: AuthRequest, response: Response) {
    // Limit malformed requests as well as valid credential attempts.
    this.limiter.check(request.ip ?? 'unknown', typeof body === 'object' && body && 'username' in body ? String(body.username).trim().toLowerCase().slice(0, 32) : 'invalid');
    const parsed = credentialsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'INVALID_CREDENTIALS_INPUT', message: 'Check your username and password.',
      fields: parsed.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })) });
    const { identity, token } = await this.auth.signIn(parsed.data, register, request);
    response.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: this.config.NODE_ENV === 'production', sameSite: 'lax', path: '/api', maxAge: SESSION_SECONDS * 1000 });
    return { user: { id: identity.userId, username: identity.username } };
  }
  @Public() @Post('register')
  register(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    return this.signIn(body, true, request, response);
  }
  @Public() @Post('login') @HttpCode(200)
  login(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    return this.signIn(body, false, request, response);
  }
  @Get('session')
  session(@Req() request: AuthRequest) { return { user: { id: request.principal!.userId, username: request.principal!.username } }; }
  @Post('logout') @HttpCode(204)
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.principal!);
    response.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: this.config.NODE_ENV === 'production', sameSite: 'lax', path: '/api' });
  }
}
