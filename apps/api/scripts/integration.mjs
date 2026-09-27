import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';

const testEnvFile = process.env.API_TEST_ENV_FILE ?? '.env.test';
const file = config({ path: testEnvFile, quiet: true });
if (file.error) throw new Error('Copy .env.test.example .env.test before running integration tests.');
const env = { ...process.env, ...file.parsed, API_ENV_FILE: testEnvFile };
const url = new URL(env.DATABASE_URL);
if (env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '55433' || !url.pathname.endsWith('_test')) {
  throw new Error('Integration tests require the local Docker test database on port 55433 with a _test name.');
}
const database = `pang_m35_${randomUUID().replaceAll('-', '')}_test`;
url.pathname = `/${database}`;
env.DATABASE_URL = url.toString();
function run(command, args) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})`);
}
const docker = ['compose', '-f', '../../compose.yaml', 'exec', '-T', 'db-test'];
run('docker', [...docker, 'createdb', '-U', url.username, database]);
try {
  // Every run starts with an empty, uniquely named database. Production data is never reset.
  run('yarn', ['prisma', 'migrate', 'deploy']);
  run('yarn', ['db:seed']);
  run('yarn', ['db:seed']);
  run('node', ['--test', '--test-concurrency=1', 'dist/test/integration.test.js', 'dist/test/schema.test.js',
    'dist/test/auth.test.js', 'dist/test/economy.test.js', 'dist/test/progression.test.js', 'dist/test/integrity.test.js']);
} finally {
  run('docker', [...docker, 'dropdb', '-U', url.username, database]);
}
