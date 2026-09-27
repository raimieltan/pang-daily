import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})`);
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`${url} process exited before readiness`);
    try { if ((await fetch(url)).ok) return; } catch { /* service is starting */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`${url} did not become ready`);
}
const children = [];
function start(command, args, env) {
  const child = spawn(command, args, { env, stdio: 'inherit', detached: true });
  children.push(child);
  return child;
}
function stop() {
  for (const child of children) if (child.pid && child.exitCode === null) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already stopped */ }
  }
}
process.on('SIGINT', () => { stop(); process.exitCode = 130; });
process.on('SIGTERM', () => { stop(); process.exitCode = 143; });
try {
  run('docker', ['compose', 'up', '-d', '--wait', 'db', 'db-test']);
  run('yarn', ['test']);
  run('yarn', ['workspace', '@pang-daily/api', 'test']);
  run('yarn', ['workspace', '@pang-daily/api', 'test:integration'], { ...process.env, API_TEST_ENV_FILE: '.env.test.example' });
  const apiPort = await freePort();
  let webPort = await freePort();
  while (webPort === apiPort) webPort = await freePort();
  const api = start('yarn', ['workspace', '@pang-daily/api', 'start'], { ...process.env, API_ENV_FILE: '.env.example',
    API_PORT: String(apiPort), FRONTEND_ORIGINS: `http://localhost:${webPort}` });
  await ready(`http://127.0.0.1:${apiPort}/api/health`, api);
  const web = start('yarn', ['next', 'dev', '--port', String(webPort)], { ...process.env,
    NEXT_DIST_DIR: '.next-persistence-test', API_INTERNAL_ORIGIN: `http://127.0.0.1:${apiPort}` });
  await ready(`http://127.0.0.1:${webPort}`, web);
  const browserEnv = { ...process.env, AUTH_BROWSER_BASE_URL: `http://localhost:${webPort}` };
  run('node', ['tests/auth.browser.mjs'], browserEnv);
  run('node', ['tests/economy.browser.mjs'], browserEnv);
} finally { stop(); }
