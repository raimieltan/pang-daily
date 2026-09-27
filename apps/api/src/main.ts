import { loadEnvironmentFile, validateEnvironment } from './config/environment';
import { createApplication } from './bootstrap';

async function main() {
  loadEnvironmentFile();
  const config = validateEnvironment(process.env);
  const app = await createApplication();
  try { await app.listen(config.API_PORT, '0.0.0.0'); }
  catch (error) { await app.close(); throw error; }
}
main().catch((error: unknown) => {
  const message = error instanceof Error && (error.message.startsWith('Invalid API configuration:') ||
    error.message.startsWith('Unable to load API_ENV_FILE:') || error.message.startsWith('Database connection failed.'))
    ? error.message : 'API startup failed. Check port availability and database configuration.';
  console.error(message);
  process.exitCode = 1;
});
