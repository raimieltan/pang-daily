import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import type { Credentials } from '@pang-daily/contracts';
import { API_CONFIG } from '../config/environment.module';
import type { Environment } from '../config/environment';
import { AuthRepository } from '../database/auth.repository';
import { AUTHENTICATION_STRATEGY, type AuthenticationStrategy } from './authentication-strategy';

export const SESSION_COOKIE = 'pang_session';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export type Principal = { userId: string; username: string; sessionHash: string };
export type AuthRequest = Request & { principal?: Principal; requestId: string };

@Injectable()
export class AuthService {
  constructor(@Inject(AUTHENTICATION_STRATEGY) private readonly strategy: AuthenticationStrategy,
    @Inject(AuthRepository) private readonly sessions: AuthRepository,
    @Inject(API_CONFIG) private readonly config: Environment) {}
  private hash(token: string) { return createHmac('sha256', this.config.SESSION_SECRET).update(token).digest('hex'); }
  readToken(request: Request) {
    const values = (request.headers.cookie ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${SESSION_COOKIE}=`));
    if (values.length !== 1) return undefined;
    const token = values[0].slice(SESSION_COOKIE.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
  }
  async signIn(credentials: Credentials, register: boolean, request: Request) {
    const identity = register ? await this.strategy.register(credentials) : await this.strategy.authenticate(credentials);
    const token = randomBytes(32).toString('base64url');
    const oldToken = this.readToken(request);
    await this.sessions.issueSession(identity.userId, this.hash(token), new Date(Date.now() + SESSION_SECONDS * 1000), oldToken ? this.hash(oldToken) : undefined);
    return { identity, token };
  }
  async resolve(request: Request) {
    const token = this.readToken(request);
    return token ? this.sessions.findSession(this.hash(token)) : null;
  }
  logout(principal: Principal) { return this.sessions.revokeSession(principal.sessionHash); }
}
