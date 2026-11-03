import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertTestDatabase } from './guard.js';

export default function globalSetup(): void {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const mongoUri = process.env.TEST_MONGO_URI;
  if (!databaseUrl) throw new Error('Set TEST_DATABASE_URL to an isolated PostgreSQL _test database');
  if (!mongoUri) throw new Error('Set TEST_MONGO_URI to an isolated MongoDB _test database');
  assertTestDatabase(databaseUrl, 'TEST_DATABASE_URL');
  assertTestDatabase(mongoUri, 'TEST_MONGO_URI');
  execFileSync(process.execPath, [
    createRequire(import.meta.url).resolve('prisma/build/index.js'), 'migrate', 'deploy',
  ], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}
