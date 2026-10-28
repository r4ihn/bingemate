import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Hostnames in a connection string. new URL() rejects multi-host strings such as
 * mongodb://a:27017,b:27018/db?replicaSet=rs0, so the authority is split by hand.
 */
function hostsOf(name: string, value: string): string[] {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#@]*@)?([^/?#]*)(?:[^?#]*)(?:\?([^#]*))?/i.exec(
    value,
  );
  if (!match) throw new Error(`Could not parse ${name} as a connection string`);
  // postgresql:///db?host=/var/run/postgresql has no authority host; ?host= overrides it too.
  const queryHost = new URLSearchParams(match[2] ?? '').get('host');
  const authority = [match[1], queryHost].filter((h): h is string => !!h && !h.startsWith('/'));
  return authority
    .join(',')
    .split(',')
    .filter(Boolean)
    .map((hostPort) => {
      // "[::1]:27017" -> "[::1]"; "localhost:27017" -> "localhost"
      const host = hostPort.startsWith('[')
        ? hostPort.slice(0, hostPort.indexOf(']') + 1)
        : hostPort.split(':')[0];
      return (host ?? '').toLowerCase();
    });
}

/**
 * The loaders can TRUNCATE every table and give every user a known password, so they refuse to
 * touch a database that is not on this machine unless --allow-remote is passed.
 */
export function assertLocalDatabases(): void {
  if (process.argv.includes('--allow-remote')) return;
  for (const name of ['DATABASE_URL', 'MONGO_URI']) {
    const value = process.env[name];
    if (!value) continue;
    const remote = hostsOf(name, value).find((host) => !LOCAL_HOSTS.has(host));
    if (remote !== undefined) {
      throw new Error(
        `${name} points at "${remote}", not this machine. Pass --allow-remote if that is intended.`,
      );
    }
  }
}

/** Load apps/api/.env into process.env (existing variables win), so the loaders use the API's settings. */
export function loadApiEnv(): void {
  const file = fileURLToPath(new URL('../../../apps/api/.env', import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}
