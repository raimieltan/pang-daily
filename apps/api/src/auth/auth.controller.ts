import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { credentialsSchema } from '@pang-daily/contracts';
import { API_CONFIG } from '../config/environment.module';
import type { Environment } from '../config/environment';
import { AuthService, SESSION_COOKIE, SESSION_SECONDS, type AuthRequest, type Principal } from './auth.service';
import { AuthRateLimiter } from './auth-rate-limiter';
import { Actor } from '../integrity/actor';
import { validateDto } from '../integrity/validation';
import { Public } from './session.guard';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(AuthRateLimiter) private readonly limiter: AuthRateLimiter,
    @Inject(API_CONFIG) private readonly config: Environment) {}
  private async signIn(body: unknown, register: boolean, request: AuthRequest, response: Response) {
    // Limit malformed requests as well as valid credential attempts.
    this.limiter.check(request.ip ?? 'unknown', typeof body === 'object' && body && 'username' in body ? String(body.username).trim().toLowerCase().slice(0, 32) : 'invalid');
    const credentials = validateDto(credentialsSchema, body, 'INVALID_CREDENTIALS_INPUT', 'Check your username and password.');
    const { identity, token } = await this.auth.signIn(credentials, register, request);
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
  session(@Actor() principal: Principal) { return { user: { id: principal.userId, username: principal.username } }; }
  @Post('logout') @HttpCode(204)
  async logout(@Actor() principal: Principal, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(principal);
    response.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: this.config.NODE_ENV === 'production', sameSite: 'lax', path: '/api' });
  }
}
