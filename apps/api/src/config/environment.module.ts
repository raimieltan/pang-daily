import { Global, Module } from '@nestjs/common';
import { validateEnvironment } from './environment';

export const API_CONFIG = Symbol('API_CONFIG');
@Global()
@Module({
  providers: [{ provide: API_CONFIG, useFactory: () => validateEnvironment(process.env) }],
  exports: [API_CONFIG],
})
export class EnvironmentModule {}
