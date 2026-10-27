import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * The loaders can TRUNCATE every table and give every user a known password, so they refuse to
 * touch a database that is not on this machine unless --allow-remote is passed.
 */
export function assertLocalDatabases(): void {
  if (process.argv.includes('--allow-remote')) return;
  for (const name of ['DATABASE_URL', 'MONGO_URI']) {
    const value = process.env[name];
    if (!value) continue;
    const host = new URL(value).hostname;
    if (!LOCAL_HOSTS.has(host)) {
      throw new Error(
        `${name} points at "${host}", not this machine. Pass --allow-remote if that is intended.`,
      );
    }
  }
}

/** Load apps/api/.env into process.env (existing variables win), so the loaders use the API's settings. */
export function loadApiEnv(): void {
  const file = fileURLToPath(new URL('../../../apps/api/.env', import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}
