import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Credentials } from '@pang-daily/contracts';
import { AuthRepository } from '../database/auth.repository';
import type { AuthenticationStrategy } from './authentication-strategy';
import { hashPassword, verifyPassword } from './passwords';

@Injectable()
export class PasswordStrategy implements AuthenticationStrategy {
  readonly name = 'password';
  constructor(@Inject(AuthRepository) private readonly accounts: AuthRepository) {}
  register(credentials: Credentials) {
    return hashPassword(credentials.password).then(hash => this.accounts.register(credentials.username, hash));
  }
  async authenticate(credentials: Credentials) {
    const account = await this.accounts.findCredential(credentials.username);
    const valid = await verifyPassword(credentials.password, account?.passwordHash);
    if (!valid || !account?.active) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Incorrect username or password.' });
    if (account.passwordHash.startsWith('scrypt-v1$')) {
      await this.accounts.upgradePasswordHash(account.userId, account.passwordHash, await hashPassword(credentials.password));
    }
    return { userId: account.userId, username: account.username };
  }
}
