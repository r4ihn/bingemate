import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Prisma, PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';
import { assertBenchDatabase } from './lib/guard.js';
import type { Ctx, Scenario } from './lib/scenario.js';
import { collection, dropAll } from './lib/setup.js';
import { summarize } from './lib/stats.js';
import scenarios from './scenarios/index.js';

type Options = { scenario: string; runs?: number; warmup?: number; keepSetup: boolean; dropOnly: boolean; list: boolean };
type Result = ReturnType<typeof summarize> & { scenario: string; store: string; warmup: number };
export function parseOptions(args: string[]): Options {
  const o: Options = { scenario: 'all', keepSetup: false, dropOnly: false, list: false };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--keep-setup') o.keepSetup = true;
    else if (flag === '--drop-only') o.dropOnly = true;
    else if (flag === '--list') o.list = true;
    else if (flag === '--scenario') {
      const name = args[++i];
      if (!name || (name !== 'all' && !scenarios.some((s) => s.name === name))) throw new Error('Unknown or missing scenario');
      o.scenario = name;
    } else if (flag === '--runs' || flag === '--warmup') {
      const raw = args[++i];
      const value = Number(raw);
      if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < (flag === '--runs' ? 1 : 0)) {
        throw new Error(`${flag} requires a ${flag === '--runs' ? 'positive' : 'nonnegative'} safe integer`);
      }
      if (flag === '--runs') o.runs = value;
      else o.warmup = value;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (o.keepSetup && o.dropOnly) throw new Error('--keep-setup cannot be combined with --drop-only');
  if (o.list && o.dropOnly) throw new Error('--list cannot be combined with --drop-only');
  return o;
}

export async function measureScenario(scenario: Scenario, ctx: Ctx, o: Options): Promise<Result[]> {
  const results: Result[] = [];
  const runs = o.runs ?? scenario.defaultRuns ?? 200;
  const warmup = o.warmup ?? scenario.defaultWarmup ?? 20;
  try {
    await scenario.setup?.(ctx);
    for (const store of ['sql', 'mongo', 'app'] as const) {
      const work = scenario[store];
      if (!work) continue;
      for (let n = 0; n < warmup; n++) await work(ctx);
      const samples: number[] = [];
      for (let n = 0; n < runs; n++) {
        const start = performance.now();
        await work(ctx);
        samples.push(performance.now() - start);
      }
      results.push({ scenario: scenario.name, store, warmup, ...summarize(samples) });
    }
    return results;
  } finally {
    if (!ctx.keepSetup) await scenario.teardown?.(ctx);
  }
}

async function report(ctx: Ctx, results: Result[], notes: Map<string, string[]>, pool: string): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  let sha = 'unavailable';
  try { sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* report still works outside git */ }
  const counts = await ctx.pg.$queryRaw<{ titles: bigint; reviews: bigint }[]>(Prisma.sql`
    SELECT (SELECT count(*) FROM "Title") AS titles, (SELECT count(*) FROM "Review") AS reviews`);
  const bodies = await collection(ctx, 'reviewbodies').countDocuments();
  const replies = await collection(ctx, 'replies').countDocuments();
  const columns = ['scenario', 'store', 'runs', 'warmup', 'median_ms', 'p95_ms', 'max_ms', 'min_ms'];
  const values = results.map((r) => [r.scenario, r.store, r.runs, r.warmup, r.median.toFixed(3), r.p95.toFixed(3), r.max.toFixed(3), r.min.toFixed(3)]);
  console.table(results.map((r) => ({ ...r, median: +r.median.toFixed(3), p95: +r.p95.toFixed(3), max: +r.max.toFixed(3), min: +r.min.toFixed(3) })));
  const md = [
    `# BingeMate benchmarks — ${date}`, '',
    '**SYNTHETIC data**', '',
    `Date (UTC): ${date} | Git: ${sha} | Node: ${process.version}`,
    `Pools: PostgreSQL connection_limit=${pool}; MongoDB maxPoolSize=10.`,
    `Live row counts (after scenario cleanup unless --keep-setup): titles=${counts[0]!.titles}, reviews=${counts[0]!.reviews}, bodies=${bodies}, replies=${replies}.`, '',
    "Prisma's client overhead is included on the SQL side. MongoDB uses native driver collection calls on the dedicated Mongoose connection.",
    'Runs execute sequentially in sql, mongo, app order. Warmup samples are discarded. Times are milliseconds; median and p95 use nearest-rank percentiles.',
    'Cold-cache measurements were not performed by this harness; these runs do not reset either database cache.', '',
    `| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`,
    ...values.map((row) => `| ${row.join(' | ')} |`), '',
    ...scenarios.filter((s) => notes.has(s.name)).flatMap((s) => [`## ${s.name}`, '', s.description, '', ...(notes.get(s.name) ?? []).map((note) => `- ${note}`), '']),
  ].join('\n');
  const directory = new URL('./results/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(`${date}.md`, directory), md + '\n');
  await writeFile(new URL(`${date}.csv`, directory), [columns.join(','), ...values.map((row) => row.join(','))].join('\n') + '\n');
  console.log(`Wrote benchmarks/results/${date}.md and .csv`);
}

export async function main(args = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const o = parseOptions(args);
  if (o.list) {
    for (const s of scenarios) console.log(`${s.name}: ${s.description}`);
    return;
  }
  const pgUrl = env.BENCH_DATABASE_URL;
  const mongoUrl = env.BENCH_MONGO_URI;
  if (!pgUrl) throw new Error('BENCH_DATABASE_URL is required');
  if (!mongoUrl) throw new Error('BENCH_MONGO_URI is required');
  assertBenchDatabase(pgUrl);
  assertBenchDatabase(mongoUrl);
  const parsed = new URL(pgUrl);
  if (parsed.protocol !== 'postgresql:') throw new Error('BENCH_DATABASE_URL must use postgresql:');
  if (!['mongodb:', 'mongodb+srv:'].includes(new URL(mongoUrl).protocol)) throw new Error('BENCH_MONGO_URI must use mongodb: or mongodb+srv:');
  if (!parsed.searchParams.has('connection_limit')) parsed.searchParams.set('connection_limit', '10');
  const pool = parsed.searchParams.get('connection_limit')!;
  const pg = new PrismaClient({ datasources: { db: { url: parsed.toString() } } });
  let mongo: mongoose.Connection | undefined;
  try {
    mongo = mongoose.createConnection(mongoUrl, { maxPoolSize: 10, autoIndex: false });
    await mongo.asPromise();
    const notes = new Map<string, string[]>();
    let current: string[] = [];
    const ctx: Ctx = { pg, mongo, keepSetup: o.keepSetup, note: (msg) => { current.push(msg); console.log(msg); } };
    if (o.dropOnly) {
      await dropAll(ctx);
      console.log('Dropped bench_* objects and removed bench-ins- rows; title ratings recomputed.');
      return;
    }
    const results: Result[] = [];
    for (const scenario of scenarios.filter((s) => o.scenario === 'all' || s.name === o.scenario)) {
      console.log(`Running ${scenario.name}`);
      current = [];
      notes.set(scenario.name, current);
      results.push(...await measureScenario(scenario, ctx, o));
    }
    await report(ctx, results, notes, pool);
  } finally {
    const closed = await Promise.allSettled([pg.$disconnect(), ...(mongo ? [mongo.close()] : [])]);
    for (const result of closed) if (result.status === 'rejected') console.error('Client close failed:', result.reason);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; });
}
