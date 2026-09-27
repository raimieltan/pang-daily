import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { API_CONFIG } from '../config/environment.module';
import type { Environment } from '../config/environment';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly client: PrismaClient;

  constructor(@Inject(API_CONFIG) config: Environment) {
    this.client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 3000,
        query_timeout: 3000, statement_timeout: 3000 }),
    });
  }
  async onModuleInit() {
    try { await this.client.$connect(); }
    catch { throw new Error('Database connection failed. Check DATABASE_URL and PostgreSQL availability.'); }
  }
  async onModuleDestroy() { await this.client.$disconnect(); }
  async isReady(): Promise<boolean> {
    try {
      // Also verifies that deployment migrations were applied.
      const metadata = await this.client.schemaVersion.findUnique({ where: { id: 1 } });
      return metadata !== null && metadata.version >= 1;
    } catch {
      this.logger.warn('Database readiness check failed');
      return false;
    }
  }
}
