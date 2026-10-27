import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Load apps/api/.env into process.env (existing variables win), so the loaders use the API's settings. */
export function loadApiEnv(): void {
  const file = fileURLToPath(new URL('../../../apps/api/.env', import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}
