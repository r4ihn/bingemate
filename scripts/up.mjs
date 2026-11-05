#!/usr/bin/env node
/* global console */
/**
 * One command from a fresh clone (or a stale checkout) to a running app:
 *
 *   npm run up                   install → env files → databases → migrations → data → api + web
 *   npm run up -- --reload-data  wipe local data and load data/processed again
 *   npm run up -- --demo         use the small demo seed instead of the dataset
 *   npm run up -- --no-dev       prepare everything but don't start the servers
 *
 * Every step is safe to repeat: it only installs when the lockfile changed, never overwrites an
 * existing .env, applies only pending migrations, and loads the dataset by itself only into an
 * empty database. Replacing existing data always needs --reload-data.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import process from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

const c = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = c('1');
const dim = c('2');
const red = c('31');
const yellow = c('33');
const green = c('32');

let stepNo = 0;
const step = (msg) => console.log(`\n${bold(`[${++stepNo}]`)} ${msg}`);
const info = (msg) => console.log(dim(`    ${msg}`));
const warn = (msg) => console.log(yellow(`    ! ${msg}`));
function fail(msg, hint) {
  console.error(`\n${red(`✖ ${msg}`)}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

/**
 * npm/npx/docker are .cmd shims on Windows and need a shell there. Node warns (DEP0190) when an
 * args array is passed with `shell: true`, so on Windows send one command string instead. Every
 * argument used here is a fixed literal without spaces, so nothing needs quoting.
 */
const isWin = process.platform === 'win32';
const sh = (cmd, cmdArgs) =>
  isWin ? [[cmd, ...cmdArgs].join(' '), [], { shell: true }] : [cmd, cmdArgs, {}];

/** Runs a command with live output; exits the whole script if it fails. */
function run(cmd, cmdArgs, { cwd = root, label } = {}) {
  info(`$ ${[cmd, ...cmdArgs].join(' ')}`);
  const [file, argv, opts] = sh(cmd, cmdArgs);
  const res = spawnSync(file, argv, { cwd, stdio: 'inherit', ...opts });
  if (res.status !== 0) fail(`${label ?? cmd} failed (exit ${res.status ?? res.signal}).`);
}

/**
 * Resolves true when something accepts connections on localhost:port. Probing by connecting (not
 * by binding) also catches servers listening on IPv6 `::`, which a bind to 127.0.0.1 misses on
 * Windows.
 */
function portInUse(port) {
  return new Promise((resolve) => {
    const sock = connect({ port, host: 'localhost', autoSelectFamily: true })
      .once('connect', () => {
        sock.destroy();
        resolve(true);
      })
      .once('error', () => resolve(false));
    sock.setTimeout(1000, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

/** KEY=value pairs from an env file (quotes stripped); empty object if the file is missing. */
function readEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/** Sets KEY=value in an env file, replacing the existing line or appending one. */
function setEnv(file, key, value) {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  const next = re.test(text)
    ? text.replace(re, line)
    : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  if (next !== text) writeFileSync(file, next);
}

/** Host port Docker published for a container port, or null if the container isn't running. */
function publishedPort(container, containerPort) {
  const res = spawnSync('docker', ['port', container, String(containerPort)], { encoding: 'utf8' });
  const m = res.status === 0 ? res.stdout.match(/:(\d+)\s*$/m) : null;
  return m ? Number(m[1]) : null;
}

/**
 * Picks this machine's host port for a database container, so a Postgres or Mongo installed
 * locally (or a friend's different setup) never collides with ours and nobody edits ports by hand:
 *   1. POSTGRES_PORT / MONGO_PORT from the shell wins as-is (explicit choice).
 *   2. Else the port saved in the root .env, if it's still free (or it's our own container).
 *   3. Else the port our running container already uses.
 *   4. Else the first free port from the default upward (5432, 5433, ...).
 */
async function choosePort({ key, container, containerPort, start }) {
  if (process.env[key]) return Number(process.env[key]);
  const ours = publishedPort(container, containerPort);
  const saved = Number(readEnv(rootEnv)[key]) || null;
  if (saved) {
    if (saved === ours || !(await portInUse(saved))) return saved;
    warn(`${key}=${saved} in .env is now taken by another program, so picking a free port.`);
  } else if (ours) {
    return ours;
  }
  for (let port = start; port < start + 100; port++) {
    if (port === ours || !(await portInUse(port))) return port;
  }
  fail(`No free port found for ${key} between ${start} and ${start + 99}.`);
}

/**
 * Points a URL in apps/api/.env at the chosen port. Only rewrites localhost / 127.0.0.1 URLs, so
 * a remote database someone configured on purpose is left alone.
 */
function syncUrlPort(file, key, port) {
  const text = readFileSync(file, 'utf8');
  const re = new RegExp(
    `^(${key}=["']?[a-z]+://(?:[^@/\\s]*@)?(?:localhost|127\\.0\\.0\\.1):)(\\d+)`,
    'm',
  );
  const m = text.match(re);
  if (!m) return warn(`${key} in apps/api/.env is not a localhost URL; leaving it as it is.`);
  if (Number(m[2]) === port) return;
  writeFileSync(file, text.replace(re, `$1${port}`));
  info(`apps/api/.env: ${key} port ${m[2]} → ${port}`);
}

const rootEnv = join(root, '.env');

// ── 1. Prerequisites ────────────────────────────────────────────────────────────────────────────
step('Checking prerequisites');
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 20) fail(`Node ${process.versions.node} is too old.`, 'Install Node 20 or newer.');
info(`node ${process.versions.node}`);

const docker = spawnSync('docker', ['version', '--format', 'json'], { encoding: 'utf8' });
const dockerJson = docker.status === 0 ? JSON.parse(docker.stdout) : null;
if (docker.error)
  fail('Docker is not installed.', 'Install Docker Desktop: https://docs.docker.com/get-docker/');
if (!dockerJson?.Server) {
  fail(
    'Docker is not running.',
    'Start Docker Desktop, wait until it says "Engine running", then run this again.',
  );
}
info(`docker engine ${dockerJson.Server.Version}`);

for (const [port, what] of [
  [4000, 'API'],
  [5173, 'website'],
]) {
  if (!args.has('--no-dev') && (await portInUse(port))) {
    fail(
      `Port ${port} (${what}) is already in use.`,
      'You probably have an older "npm run dev" still running. Stop it with Ctrl-C and try again.',
    );
  }
}

// ── 2. Dependencies ─────────────────────────────────────────────────────────────────────────────
step('Installing dependencies');
const marker = join(root, 'node_modules', '.package-lock.json');
const lock = join(root, 'package-lock.json');
if (!existsSync(marker) || statSync(lock).mtimeMs > statSync(marker).mtimeMs) {
  run('npm', ['install'], { label: 'npm install' });
} else {
  info('up to date (package-lock.json unchanged since the last install)');
}

// ── 3. Ports and env files ──────────────────────────────────────────────────────────────────────
step('Choosing database ports and checking env files');
const pgPort = await choosePort({
  key: 'POSTGRES_PORT',
  container: 'bingemate-postgres',
  containerPort: 5432,
  start: 5432,
});
const mongoPort = await choosePort({
  key: 'MONGO_PORT',
  container: 'bingemate-mongo',
  containerPort: 27017,
  start: 27017,
});
// docker compose reads the root .env by itself, so plain "npm run db:up" uses the same ports.
setEnv(rootEnv, 'POSTGRES_PORT', pgPort);
setEnv(rootEnv, 'MONGO_PORT', mongoPort);
info(`PostgreSQL → localhost:${pgPort}, MongoDB → localhost:${mongoPort} (saved in .env)`);

const apiEnv = join(root, 'apps/api/.env');
if (!existsSync(apiEnv)) {
  const secret = randomBytes(48).toString('base64url');
  const text = readFileSync(join(root, 'apps/api/.env.example'), 'utf8').replace(
    /^JWT_SECRET=.*$/m,
    `JWT_SECRET="${secret}"`,
  );
  writeFileSync(apiEnv, text);
  info('created apps/api/.env from .env.example (with a fresh JWT_SECRET)');
} else {
  info('apps/api/.env exists');
}
syncUrlPort(apiEnv, 'DATABASE_URL', pgPort);
syncUrlPort(apiEnv, 'MONGO_URI', mongoPort);
const webEnv = join(root, 'apps/web/.env');
if (!existsSync(webEnv)) {
  copyFileSync(join(root, 'apps/web/.env.example'), webEnv);
  info('created apps/web/.env from .env.example');
} else {
  info('apps/web/.env exists');
}

// ── 4. Databases ────────────────────────────────────────────────────────────────────────────────
step(`Starting PostgreSQL (localhost:${pgPort}) and MongoDB (localhost:${mongoPort})`);
run('docker', ['compose', 'up', '-d', '--wait'], {
  label: 'docker compose up',
});

// ── 5. Schema ───────────────────────────────────────────────────────────────────────────────────
step('Applying database migrations');
const api = join(root, 'apps/api');
run('npx', ['prisma', 'migrate', 'deploy'], { cwd: api, label: 'prisma migrate deploy' });
run('npx', ['prisma', 'generate'], { cwd: api, label: 'prisma generate' });

// ── 6. Data ─────────────────────────────────────────────────────────────────────────────────────
/** Number of titles in the dev database, read straight from the container (no shell quoting). */
function titleCount() {
  const res = spawnSync(
    'docker',
    [
      'exec',
      'bingemate-postgres',
      'psql',
      '-U',
      'bingemate',
      '-d',
      'bingemate',
      '-tAc',
      'SELECT count(*) FROM "Title"',
    ],
    { encoding: 'utf8' },
  );
  if (res.status !== 0) fail('Could not count titles in PostgreSQL.', res.stderr.trim());
  return Number(res.stdout.trim());
}

/** The full cleaned dataset (data/processed): 1,500 titles with posters, 13k reviews, 5k users. */
function loadDataset(reset) {
  run('npx', ['tsx', 'data/etl/load-all.ts', ...(reset ? ['--reset'] : [])], {
    label: 'dataset load',
  });
  // Ids change on every load, so the trending cards must be rebuilt (data/etl/README.md).
  run('npx', ['tsx', '--env-file=apps/api/.env', 'apps/api/src/jobs/refreshTrending.ts'], {
    label: 'trending refresh',
  });
}

const DATASET_MIN_TITLES = 1000;
const titles = titleCount();
if (args.has('--demo')) {
  step('Seeding the small demo data (--demo)');
  run('npm', ['run', 'seed'], { label: 'seed' });
} else if (args.has('--reload-data')) {
  step('Replacing the database contents with data/processed (--reload-data)');
  warn('This wipes every user, title, review and list in your local PostgreSQL and MongoDB.');
  loadDataset(true);
} else if (titles === 0) {
  step('Loading the dataset from data/processed (empty database)');
  loadDataset(false);
} else if (titles < DATASET_MIN_TITLES) {
  step('Checking data');
  warn(`The database has only ${titles} titles, so the dataset from data/processed isn't loaded.`);
  warn('Run "npm run up -- --reload-data" to replace it with the full dataset (wipes local data).');
} else {
  step('Checking data');
  info(`${titles} titles loaded`);
}

// ── 7. Servers ──────────────────────────────────────────────────────────────────────────────────
if (args.has('--no-dev')) {
  console.log(`\n${green('✔ Ready.')} Start the app with ${bold('npm run dev')}.`);
  process.exit(0);
}
step('Starting the API and website');
console.log(`    API      ${bold('http://localhost:4000')}`);
console.log(`    Website  ${bold('http://localhost:5173')}  ${dim('← open this one')}`);
console.log(
  dim('    Ctrl-C stops both. The databases keep running; "npm run db:down" stops them.\n'),
);
const [devFile, devArgs, devOpts] = sh('npm', ['run', 'dev']);
const dev = spawn(devFile, devArgs, { cwd: root, stdio: 'inherit', ...devOpts });
dev.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => dev.kill(sig));
