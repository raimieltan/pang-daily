import { spawnSync } from 'node:child_process';

for (const args of [['prisma', 'migrate', 'dev', ...process.argv.slice(2)], ['prisma', 'generate']]) {
  const result = spawnSync('yarn', args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
