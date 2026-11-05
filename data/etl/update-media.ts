import { existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { loadIdMap } from './id-mapping.js';
import { assertLocalDatabases, loadApiEnv } from './lib/env.js';
import { PROCESSED_DIR, readProcessed, runIfMain } from './lib/io.js';
import { StepLog } from './lib/log.js';
import { NO_POSTER_REASON } from './lib/posters.js';

/**
 * Copies data/processed/title_posters.csv into Title.posterUrl on an already loaded database, so new
 * or replaced posters (from fetch-posters.ts) show up without `load-all --reset`, which would replace
 * every user, review and list entry. Only imported titles are touched (the ones in id-map.json), and a poster uploaded
 * through the app (a root-relative /api/... link) is never replaced.
 *
 * A movie hidden by the load because it had no poster (REJECTED, "Imported movie without a poster")
 * is approved again once it has one: the same rule load-postgres.ts applies.
 *
 *   npx tsx data/etl/update-media.ts            # dry run: counts only
 *   npx tsx data/etl/update-media.ts --apply    # write
 *
 * Afterwards rebuild the trending cards, which keep their own copy of each poster link:
 *   npx tsx --env-file=apps/api/.env apps/api/src/jobs/refreshTrending.ts
 */
export async function main(): Promise<void> {
  loadApiEnv();
  const log = new StepLog('update-media');
  const unknown = process.argv.slice(2).find((arg) => arg !== '--apply');
  if (unknown) throw new Error(`Unsupported argument: ${unknown}. Only --apply is allowed.`);
  assertLocalDatabases();
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();

  try {
    const ids = loadIdMap().titles;
    const byDbId = (file: string, column: string) => {
      const map = new Map<string, string>();
      if (!existsSync(PROCESSED_DIR + file)) return map;
      for (const r of readProcessed(file)) {
        const id = ids[r['title_id'] ?? ''];
        if (id && r[column]) map.set(id, r[column]);
      }
      return map;
    };
    const posters = byDbId('title_posters.csv', 'poster_url');
    log.count('imported titles with a poster', posters.size);

    const current = await prisma.title.findMany({
      where: { id: { in: Object.values(ids) } },
      select: {
        id: true,
        posterUrl: true,
        status: true,
        rejectionReason: true,
      },
    });
    const changes = current.flatMap((t) => {
      const poster = posters.get(t.id);
      const newPoster =
        poster !== undefined && !t.posterUrl?.startsWith('/') && poster !== t.posterUrl;
      if (!newPoster) return [];
      const unhide = newPoster && t.status === 'REJECTED' && t.rejectionReason === NO_POSTER_REASON;
      return [
        {
          id: t.id,
          data: {
            ...(newPoster && { posterUrl: poster }),
            ...(unhide && { status: 'APPROVED' as const, rejectionReason: null }),
          },
          newPoster,
          unhide,
        },
      ];
    });
    log.count('poster links to change', changes.filter((c) => c.newPoster).length);
    log.count(
      'hidden movies to show again (they have a poster now)',
      changes.filter((c) => c.unhide).length,
    );

    if (!apply) {
      log.info('DRY RUN: no database writes. Re-run with --apply to update.');
      return;
    }
    await prisma.$transaction(
      changes.map((c) => prisma.title.update({ where: { id: c.id }, data: c.data })),
    );
    log.count('titles updated', changes.length);
  } finally {
    log.finish();
    await prisma.$disconnect();
  }
}

runIfMain(
  import.meta.url,
  () =>
    void main().catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }),
);
