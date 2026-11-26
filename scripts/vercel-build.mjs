/* global console, process */
// Vercel build (vercel.json → buildCommand). Generates the Prisma client, applies migrations on
// production deploys only, bundles the API function and builds the web app into apps/web/dist.
// Preview deploys skip migrations: the database integrations share one database across Preview and
// Production, so only a production deploy may change its schema.
import { spawnSync } from 'node:child_process';

function run(label, args, command = 'npm') {
  console.log(`\n▶ ${label}`);
  const res = spawnSync(command, args, {
    stdio: 'inherit',
    shell: command === 'npm' && process.platform === 'win32',
  });
  if (res.status !== 0) {
    console.error(`✖ ${label} failed`);
    process.exit(res.status ?? 1);
  }
}

run('prisma generate', ['run', 'prisma:generate']);
if (process.env.VERCEL_ENV === 'production') {
  run('prisma migrate deploy', [
    'exec',
    '--workspace',
    'apps/api',
    '--',
    'prisma',
    'migrate',
    'deploy',
  ]);
} else {
  console.log(`\n▶ skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'})`);
}
// process.execPath, not `npm exec node`: npm would fetch the unrelated "node" package from the registry.
run('bundle API function', ['apps/api/scripts/bundle-vercel.mjs'], process.execPath);
run('build web', ['run', 'build', '--workspace', 'apps/web']);
