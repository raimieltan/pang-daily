import { defineConfig } from 'prisma/config';
import { loadEnvironmentFile } from './src/config/environment';

loadEnvironmentFile();
// Generation/build does not need a running database or deployment credentials.
// Database commands fail explicitly if DATABASE_URL is absent.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
