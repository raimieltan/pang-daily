import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { loadEnvironmentFile, validateEnvironment } from '../src/config/environment';

async function seed() {
  loadEnvironmentFile();
  const config = validateEnvironment(process.env);
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL }) });
  try {
    // Idempotent infrastructure seed; content definitions stay in game-core.
    await client.schemaVersion.upsert({ where: { id: 1 }, update: {}, create: { id: 1, version: 5 } });
  } finally {
    await client.$disconnect();
  }
}
seed().catch(() => { console.error('Database seed failed. Check database configuration and migrations.'); process.exitCode = 1; });
