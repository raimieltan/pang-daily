import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Injectable()
export class AuthRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async findCredential(username: string) {
    const credential = await this.db.client.localCredential.findUnique({ where: { username }, include: { user: true } });
    return credential ? { userId: credential.userId, username: credential.username, passwordHash: credential.passwordHash,
      active: credential.user.deactivatedAt === null } : null;
  }
  async register(username: string, passwordHash: string) {
    try {
      const user = await this.db.client.user.create({ data: { identityProvider: 'password', identitySubject: username,
        credential: { create: { username, passwordHash } } } });
      return { userId: user.id, username };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new ConflictException({ code: 'USERNAME_TAKEN', message: 'That username is already in use.' });
      }
      throw error;
    }
  }
  async issueSession(userId: string, tokenHash: string, expiresAt: Date, oldHash?: string) {
    await this.db.client.$transaction(async (tx) => {
      await tx.authSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
      if (oldHash) await tx.authSession.deleteMany({ where: { tokenHash: oldHash } });
      await tx.authSession.create({ data: { userId, tokenHash, expiresAt } });
    });
  }
  async findSession(tokenHash: string) {
    const session = await this.db.client.authSession.findUnique({ where: { tokenHash }, include: { user: { include: { credential: true } } } });
    if (!session || session.expiresAt <= new Date() || session.user.deactivatedAt !== null) return null;
    return { userId: session.userId, username: session.user.credential?.username ?? session.user.identitySubject, sessionHash: tokenHash };
  }
  async revokeSession(tokenHash: string) { await this.db.client.authSession.deleteMany({ where: { tokenHash } }); }
  async upgradePasswordHash(userId: string, previousHash: string, passwordHash: string) {
    await this.db.client.localCredential.updateMany({ where: { userId, passwordHash: previousHash }, data: { passwordHash } });
  }
}
