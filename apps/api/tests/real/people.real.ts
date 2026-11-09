import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { TitleStatus } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { createTitle, resetDatabases } from './helpers.js';

const app = createApp();
beforeEach(resetDatabases);

const person = (name: string) => prisma.person.create({ data: { name } });

/** Credits every person on a new title, all as actors. */
async function title(people: { id: string }[], status: TitleStatus = 'APPROVED') {
  const t = await createTitle({ status });
  await prisma.titlePerson.createMany({
    data: people.map((p) => ({ titleId: t.id, personId: p.id, role: 'ACTOR' as const })),
  });
  return t;
}

const connect = (from: string, to: string, query = '') =>
  request(app).get(`/api/people/${from}/connection/${to}${query}`);

const names = (body: { path: { person: { name: string } }[] | null }) =>
  body.path?.map((s) => s.person.name) ?? null;

describe('real degrees of separation', () => {
  it('finds a chain through shared titles and says which title links each pair', async () => {
    // A -T1- B -T2- C -T3- D
    const [a, b, c, d] = await Promise.all(['A', 'B', 'C', 'D'].map(person));
    const t1 = await title([a!, b!]);
    const t2 = await title([b!, c!]);
    const t3 = await title([c!, d!]);

    const res = await connect(a!.id, d!.id);

    expect(res.status).toBe(200);
    expect(res.body.degrees).toBe(3);
    expect(names(res.body)).toEqual(['A', 'B', 'C', 'D']);
    expect(res.body.path.map((s: { via: { id: string } | null }) => s.via?.id ?? null)).toEqual([
      null,
      t1.id,
      t2.id,
      t3.id,
    ]);
  });

  it('a person is 0 steps from themselves and 1 step from a co-star', async () => {
    const [a, b] = await Promise.all(['A', 'B'].map(person));
    await title([a!, b!]);

    expect((await connect(a!.id, a!.id)).body).toMatchObject({ degrees: 0 });
    expect((await connect(a!.id, b!.id)).body).toMatchObject({ degrees: 1 });
  });

  it('takes the shortest chain when a longer one exists', async () => {
    // Long: A-B-C-D-E. Short: A and E share one title.
    const people = await Promise.all(['A', 'B', 'C', 'D', 'E'].map(person));
    for (let i = 0; i < 4; i++) await title([people[i]!, people[i + 1]!]);
    await title([people[0]!, people[4]!]);

    const res = await connect(people[0]!.id, people[4]!.id);
    expect(res.body.degrees).toBe(1);
  });

  it('survives cycles and big casts without looping', async () => {
    // A triangle plus a 20-person cast all sharing one title, then one exit to Z.
    const [a, b, c, z] = await Promise.all(['A', 'B', 'C', 'Z'].map(person));
    await title([a!, b!]);
    await title([b!, c!]);
    await title([c!, a!]);
    const cast = await Promise.all(Array.from({ length: 20 }, (_, i) => person(`Cast ${i}`)));
    await title([c!, ...cast]);
    await title([cast[19]!, z!]);

    const res = await connect(a!.id, z!.id);
    expect(res.status).toBe(200);
    expect(res.body.degrees).toBe(3);
    expect(names(res.body)).toEqual(['A', 'C', 'Cast 19', 'Z']);
  });

  it('answers null when there is no chain, or none within maxDepth', async () => {
    const [a, b, c, loner] = await Promise.all(['A', 'B', 'C', 'Loner'].map(person));
    await title([a!, b!]);
    await title([b!, c!]);
    await title([loner!]);

    expect((await connect(a!.id, loner!.id)).body).toEqual({
      degrees: null,
      maxDepth: 6,
      path: null,
    });
    expect((await connect(a!.id, c!.id, '?maxDepth=1')).body).toMatchObject({
      degrees: null,
      maxDepth: 1,
    });
    expect((await connect(a!.id, c!.id, '?maxDepth=2')).body).toMatchObject({ degrees: 2 });
  });

  it('does not link people through a title that is not approved', async () => {
    const [a, b] = await Promise.all(['A', 'B'].map(person));
    await title([a!, b!], 'PENDING');
    expect((await connect(a!.id, b!.id)).body.path).toBeNull();
  });

  it('404 for an unknown person, 400 for a bad maxDepth', async () => {
    const a = await person('A');
    expect((await connect(a.id, 'missing')).status).toBe(404);
    expect((await connect(a.id, a.id, '?maxDepth=7')).status).toBe(400);
  });

  it('search and person page only count approved titles', async () => {
    const [ann, anna] = await Promise.all(['Ann Lee', 'Anna Lee'].map(person));
    const shown = await title([ann!, anna!]);
    await title([anna!]);
    await title([ann!], 'REJECTED');

    const search = await request(app).get('/api/people?q=lee');
    expect(search.body).toEqual([
      { id: anna!.id, name: 'Anna Lee', titleCount: 2 },
      { id: ann!.id, name: 'Ann Lee', titleCount: 1 },
    ]);
    expect((await request(app).get('/api/people?q=100%')).body).toEqual([]);

    const page = await request(app).get(`/api/people/${ann!.id}`);
    expect(page.body).toMatchObject({
      name: 'Ann Lee',
      credits: [{ id: shown.id, roles: ['ACTOR'] }],
    });
    expect(page.body.credits).toHaveLength(1);
  });
});
