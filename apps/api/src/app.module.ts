import { Module } from '@nestjs/common';
import { EnvironmentModule } from './config/environment.module';
import { HealthModule } from './health/health.module';

@Module({ imports: [EnvironmentModule, HealthModule] })
export class AppModule {}
