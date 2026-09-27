import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

const postgresUrl = z.string().url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ['postgres:', 'postgresql:'].includes(url.protocol) && url.pathname.length > 1;
}, 'must be a PostgreSQL URL with a database name');
const origin = z.string().url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
}, 'must be an HTTP(S) origin without a path or trailing slash');
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: postgresUrl,
  API_PORT: z.coerce.number().int().min(1).max(65535),
  FRONTEND_ORIGINS: z.string().transform((value) => value.split(',').map((item) => item.trim()))
    .pipe(z.array(origin).min(1)),
  SESSION_SECRET: z.string().min(32),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
});
export type Environment = z.infer<typeof schema>;

export function validateEnvironment(values: NodeJS.ProcessEnv): Environment {
  const result = schema.safeParse(values);
  if (!result.success) {
    throw new Error('Invalid API configuration:\n' + result.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n'));
  }
  return result.data;
}

// Shared by the API and Prisma CLI. Shell variables always take precedence.
// An explicit file never falls back to the development .env.
export function loadEnvironmentFile(): void {
  const result = dotenv({ path: resolve(process.cwd(), process.env.API_ENV_FILE ?? '.env'), quiet: true });
  if (result.error && process.env.API_ENV_FILE) {
    throw new Error(`Unable to load API_ENV_FILE: ${process.env.API_ENV_FILE}`);
  }
}
