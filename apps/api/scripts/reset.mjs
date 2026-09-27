import { spawnSync } from 'node:child_process';

for (const args of [
  ['prisma', 'migrate', 'reset', ...process.argv.slice(2)],
  ['prisma', 'generate'],
  ['prisma', 'db', 'seed'],
]) {
  const result = spawnSync('yarn', args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
