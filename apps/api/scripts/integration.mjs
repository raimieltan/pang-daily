import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';

// Test configuration intentionally replaces inherited development database settings.
const file = config({ path: process.env.API_TEST_ENV_FILE ?? '.env.test', quiet: true });
if (file.error) throw new Error('Copy .env.test.example to .env.test before running integration tests.');
const env = { ...process.env, ...file.parsed, API_ENV_FILE: process.env.API_TEST_ENV_FILE ?? '.env.test' };
const url = new URL(env.DATABASE_URL);
if (env.NODE_ENV !== 'test' || !url.pathname.endsWith('_test')) {
  throw new Error('Integration tests require NODE_ENV=test and a database name ending in _test.');
}
function run(command, args) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Apply committed migrations, never db push. Tests restore any schema changes.
run('yarn', ['prisma', 'migrate', 'deploy']);
run('yarn', ['db:seed']);
run('yarn', ['db:seed']);
run('node', ['--test', 'dist/test/integration.test.js']);
