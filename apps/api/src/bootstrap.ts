import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { API_CONFIG } from './config/environment.module';
import type { Environment } from './config/environment';

export async function createApplication() {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  const config = app.get<Environment>(API_CONFIG);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.FRONTEND_ORIGINS, credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.enableShutdownHooks();
  return app;
}
