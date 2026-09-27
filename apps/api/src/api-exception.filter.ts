import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { errorResponse } from './integrity/error-response';
import type { AuthRequest } from './auth/auth.service';
import { databaseErrorClass, logEvent } from './observability';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<AuthRequest>();
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = errorResponse(error, request.requestId);
    logEvent('api.request_failed', { status, requestId: request.requestId,
      actorId: request.principal?.userId ?? null, errorKind: body.kind, errorCode: String((body as Record<string, unknown>).code), ...databaseErrorClass(error) });
    response.status(status).json(body);
  }
}
