import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { API_CONFIG } from './config/environment.module';
import type { Environment } from './config/environment';
import { randomUUID } from 'node:crypto';
import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth/auth.service';
import { ApiExceptionFilter } from './api-exception.filter';
import { logEvent } from './observability';

export async function createApplication() {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  const config = app.get<Environment>(API_CONFIG);
  app.setGlobalPrefix('api');
  app.use((request: AuthRequest, response: Response, next: NextFunction) => {
    request.requestId = randomUUID();
    const started = performance.now();
    response.setHeader('X-Request-Id', request.requestId);
    response.setHeader('Cache-Control', 'no-store');
    response.on('finish', () => logEvent('api.request', { requestId: request.requestId,
      method: request.method, path: request.path, status: response.statusCode,
      durationMs: Math.round(performance.now() - started),
      actorId: request.principal?.userId ?? null }));
    next();
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({ origin: config.FRONTEND_ORIGINS, credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.enableShutdownHooks();
  return app;
}
