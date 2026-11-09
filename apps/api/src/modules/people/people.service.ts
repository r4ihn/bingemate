import { Prisma } from '@prisma/client';
import type {
  ConnectionDTO,
  MediaType,
  PersonCreditDTO,
  PersonDetailDTO,
  PersonRole,
  PersonSummaryDTO,
} from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../middleware/errorHandler.js';

/** Escapes LIKE wildcards so a search for "100%" matches the text, not everything. */
const likeContains = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

/** Up to 10 people whose name contains `q`, the most credited first. Only approved titles count. */
export async function searchPeople(q: string): Promise<PersonSummaryDTO[]> {
  const rows = await prisma.$queryRaw<{ id: string; name: string; title_count: number }[]>`
    SELECT p."id", p."name", COUNT(DISTINCT tp."titleId")::int AS "title_count"
    FROM "Person" p
    JOIN "TitlePerson" tp ON tp."personId" = p."id"
    JOIN "Title" t ON t."id" = tp."titleId" AND t."status" = 'APPROVED'
    WHERE p."name" ILIKE ${likeContains(q)}
    GROUP BY p."id", p."name"
    ORDER BY "title_count" DESC, p."name", p."id"
    LIMIT 10`;
  return rows.map((r) => ({ id: r.id, name: r.name, titleCount: r.title_count }));
}

/** A person and the approved titles they are credited on, newest first. */
export async function getPerson(id: string): Promise<PersonDetailDTO> {
  const person = await prisma.person.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      titles: {
        where: { title: { status: 'APPROVED' } },
        select: {
          role: true,
          title: {
            select: { id: true, name: true, mediaType: true, releaseYear: true, posterUrl: true },
          },
        },
      },
    },
  });
  if (!person) throw new HttpError(404, 'Person not found');

  const byTitle = new Map<string, PersonCreditDTO>();
  for (const { role, title } of person.titles) {
    const seen = byTitle.get(title.id);
    if (seen) {
      seen.roles.push(role as PersonRole);
      continue;
    }
    byTitle.set(title.id, {
      id: title.id,
      name: title.name,
      mediaType: title.mediaType as MediaType,
      releaseYear: title.releaseYear,
      ...(title.posterUrl && { posterUrl: title.posterUrl }),
      roles: [role as PersonRole],
    });
  }
  const credits = [...byTitle.values()].sort(
    (a, b) =>
      (b.releaseYear ?? -Infinity) - (a.releaseYear ?? -Infinity) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
  for (const c of credits) c.roles.sort();
  return { id: person.id, name: person.name, credits };
}

interface TraceRow {
  depth: number;
  person_id: string;
  person_name: string;
  via_id: string | null;
  via_name: string | null;
  via_type: MediaType | null;
}

/**
 * The shortest chain of shared titles between two people ("six degrees").
 *
 * People and titles form a graph: two people are linked when they are credited on the same approved
 * title. The query is a breadth-first search written as a recursive CTE:
 *
 * - `bfs` carries a whole level per row: `frontier` (the people first reached at this depth) and
 *   `visited` (everyone reached so far). Each step finds the unvisited people sharing a title with
 *   the frontier and keeps one (parent, title) per new person with DISTINCT ON. Visiting each
 *   person once is what keeps it fast: enumerating every path instead (the textbook
 *   `UNION ALL` walk with a CYCLE check) explodes, because one title's cast of 36 people alone
 *   has 36! orderings.
 * - It stops at `maxDepth`, when the frontier is empty, or as soon as the target is visited.
 * - `tree` unnests the levels into (depth, person, parent, title) rows, and `trace`, a second
 *   recursive CTE, walks from the target back to the start through the parents.
 *
 * Ties are broken on ids, so the same pair always gives the same chain. Exported for the
 * EXPLAIN ANALYZE script in benchmarks/people-connection.ts.
 */
export function connectionQuery(fromId: string, toId: string, maxDepth: number): Prisma.Sql {
  return Prisma.sql`
    WITH RECURSIVE credits AS MATERIALIZED (
      SELECT DISTINCT tp."personId", tp."titleId"
      FROM "TitlePerson" tp
      JOIN "Title" t ON t."id" = tp."titleId" AND t."status" = 'APPROVED'
    ), bfs (depth, frontier, visited, kids, parents, vias) AS (
      SELECT 0, ARRAY[${fromId}::text], ARRAY[${fromId}::text],
             ARRAY[${fromId}::text], ARRAY[NULL::text], ARRAY[NULL::text]
      UNION ALL
      SELECT w.depth + 1, n.kids, w.visited || n.kids, n.kids, n.parents, n.vias
      FROM bfs w
      CROSS JOIN LATERAL (
        SELECT array_agg(s.kid ORDER BY s.kid) AS kids,
               array_agg(s.parent ORDER BY s.kid) AS parents,
               array_agg(s.via ORDER BY s.kid) AS vias
        FROM (
          SELECT DISTINCT ON (b."personId")
                 b."personId" AS kid, a."personId" AS parent, a."titleId" AS via
          FROM unnest(w.frontier) AS f(id)
          JOIN credits a ON a."personId" = f.id
          JOIN credits b ON b."titleId" = a."titleId"
          WHERE NOT EXISTS (SELECT 1 FROM unnest(w.visited) AS v(id) WHERE v.id = b."personId")
          ORDER BY b."personId", a."personId", a."titleId"
        ) s
      ) n
      WHERE w.depth < ${maxDepth}
        AND n.kids IS NOT NULL
        AND NOT ${toId}::text = ANY (w.visited)
    ), tree AS (
      SELECT b.depth, t.kid, t.parent, t.via
      FROM bfs b
      CROSS JOIN LATERAL unnest(b.kids, b.parents, b.vias) AS t(kid, parent, via)
    ), trace AS (
      SELECT depth, kid, parent, via FROM tree WHERE kid = ${toId}
      UNION ALL
      SELECT tr.depth, tr.kid, tr.parent, tr.via
      FROM trace t
      JOIN tree tr ON tr.kid = t.parent AND tr.depth = t.depth - 1
    )
    SELECT t.depth, p."id" AS "person_id", p."name" AS "person_name",
           ti."id" AS "via_id", ti."name" AS "via_name", ti."mediaType" AS "via_type"
    FROM trace t
    JOIN "Person" p ON p."id" = t.kid
    LEFT JOIN "Title" ti ON ti."id" = t.via
    ORDER BY t.depth`;
}

export async function getConnection(
  fromId: string,
  toId: string,
  maxDepth: number,
): Promise<ConnectionDTO> {
  const found = await prisma.person.count({ where: { id: { in: [fromId, toId] } } });
  if (found < (fromId === toId ? 1 : 2)) throw new HttpError(404, 'Person not found');

  const rows = await prisma.$queryRaw<TraceRow[]>(connectionQuery(fromId, toId, maxDepth));
  if (rows.length === 0) return { degrees: null, maxDepth, path: null };
  return {
    degrees: rows.length - 1,
    maxDepth,
    path: rows.map((r) => ({
      person: { id: r.person_id, name: r.person_name },
      via:
        r.via_id && r.via_name && r.via_type
          ? { id: r.via_id, name: r.via_name, mediaType: r.via_type }
          : null,
    })),
  };
}
