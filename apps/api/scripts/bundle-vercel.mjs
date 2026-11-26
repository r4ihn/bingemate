/* global URL */
// Bundles the API's Vercel entry (src/vercel.ts) into one ESM file for the function in /api.
// Our TypeScript, the generated Prisma client and the TS-only @bingemate/shared workspace package are
// compiled in; real npm dependencies stay external so Vercel traces them (bcrypt is native).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const pkg = JSON.parse(readFileSync(here('../package.json'), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@bingemate/'));

await build({
  entryPoints: [here('../src/vercel.ts')],
  outfile: here('../dist-vercel/handler.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external,
  logLevel: 'info',
});
