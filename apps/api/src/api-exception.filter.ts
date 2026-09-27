import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthRequest } from './auth/auth.service';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<AuthRequest>();
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 503;
    const raw = error instanceof HttpException ? error.getResponse() : null;
    const details = raw && typeof raw === 'object' ? raw : { code: 'API_UNAVAILABLE', message: 'The API could not complete this request. Please retry.' };
    if (status >= 500) this.logger.error(JSON.stringify({ event: 'api.request_failed', status, requestId: request.requestId, errorType: error instanceof Error ? error.name : 'unknown', ...(error && typeof error === 'object' && 'code' in error && /^P\d{4}$/.test(String(error.code)) ? { databaseCode: error.code } : {}) }));
    response.status(status).json({ ...details, statusCode: status, requestId: request.requestId });
  }
}
