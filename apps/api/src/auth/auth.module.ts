import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module';
import { AUTHENTICATION_STRATEGY } from './authentication-strategy';
import { PasswordStrategy } from './password.strategy';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';
import { AuthRateLimiter } from './auth-rate-limiter';
import { AuthController } from './auth.controller';

@Module({ imports: [DatabaseModule], controllers: [AuthController], providers: [PasswordStrategy,
  { provide: AUTHENTICATION_STRATEGY, useExisting: PasswordStrategy }, AuthService, AuthRateLimiter,
  { provide: APP_GUARD, useClass: SessionGuard }], exports: [AuthService] })
export class AuthModule {}
