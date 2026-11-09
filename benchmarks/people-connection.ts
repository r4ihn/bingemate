/**
 * EXPLAIN ANALYZE of the "degrees of separation" query (apps/api/src/modules/people) on the loaded
 * dataset: the most-credited person against a fixed sample of other people, grouped by how many
 * steps apart they turned out to be.
 *
 * Read-only (EXPLAIN ANALYZE of a SELECT), so it runs on the development database, which is where the
 * people are; the synthetic _bench database has none. Refuses a database that is not on this machine.
 *
 *   npx tsx --env-file=apps/api/.env benchmarks/people-connection.ts [--sample 40] [--max-depth 6]
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { Prisma, PrismaClient } from '@prisma/client';
import { connectionQuery } from '../apps/api/src/modules/people/people.service.js';
import { describePlan } from './explain.js';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? Number(process.argv[i + 1]) : fallback;
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`--${name} must be a positive integer`);
  return value;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('Refusing: DATABASE_URL must point at a database on this machine');
  }
  const sample = arg('sample', 40);
  const maxDepth = arg('max-depth', 6);
  const pg = new PrismaClient();
  try {
    // The person with the most approved titles, then a deterministic sample of credited people.
    const [source] = await pg.$queryRaw<{ id: string; name: string }[]>`
      SELECT p."id", p."name" FROM "Person" p
      JOIN "TitlePerson" tp ON tp."personId" = p."id"
      JOIN "Title" t ON t."id" = tp."titleId" AND t."status" = 'APPROVED'
      GROUP BY p."id" ORDER BY COUNT(DISTINCT tp."titleId") DESC, p."id" LIMIT 1`;
    if (!source) throw new Error('No people loaded: run data/etl/load-all.ts first');
    const targets = await pg.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT tp."personId" AS "id", md5(tp."personId") FROM "TitlePerson" tp
      WHERE tp."personId" <> ${source.id} ORDER BY md5(tp."personId") LIMIT ${sample}`;

    const runs: {
      target: string;
      degrees: number | null;
      executionMs: number;
      planningMs: number;
    }[] = [];
    for (const { id } of targets) {
      const sql = connectionQuery(source.id, id, maxDepth);
      const [explained] = await pg.$queryRaw<{ 'QUERY PLAN': unknown }[]>(
        Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
      );
      const plan = describePlan(explained?.['QUERY PLAN']);
      runs.push({
        target: id,
        degrees: plan.rows > 0 ? plan.rows - 1 : null,
        executionMs: plan.executionMs,
        planningMs: plan.planningMs,
      });
    }

    const groups = new Map<string, number[]>();
    for (const r of runs) {
      const key = r.degrees === null ? `none within ${maxDepth}` : `${r.degrees} degrees`;
      groups.set(key, [...(groups.get(key) ?? []), r.executionMs]);
    }
    const summary = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([group, ms]) => ({
        group,
        pairs: ms.length,
        medianMs: Number(median(ms).toFixed(1)),
        maxMs: Number(Math.max(...ms).toFixed(1)),
      }));

    console.log(`From ${source.name} to ${runs.length} sampled people (maxDepth ${maxDepth}):`);
    console.table(summary);
    await mkdir('benchmarks/results', { recursive: true });
    const out = `benchmarks/results/people-connection-${new Date().toISOString().slice(0, 10)}.json`;
    await writeFile(out, JSON.stringify({ source, maxDepth, summary, runs }, null, 2));
    console.log(`Wrote ${out}`);
  } finally {
    await pg.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
