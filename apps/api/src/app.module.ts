import { Module } from '@nestjs/common';
import { EnvironmentModule } from './config/environment.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { PlayerModule } from './player/player.module';

import { EconomyModule } from './economy/economy.module';

@Module({ imports: [EnvironmentModule, HealthModule, AuthModule, PlayerModule, EconomyModule] })
export class AppModule {}
