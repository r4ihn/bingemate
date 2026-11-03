import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { as, createUser, resetDatabases } from './helpers.js';

const app = createApp();
beforeEach(resetDatabases);

describe('members and usernames database guarantees', () => {
  it('has exactly ADMIN and MEMBER role enum labels', async () => {
    const rows = await prisma.$queryRaw<{ label: string }[]>`
      SELECT e.enumlabel AS label FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'Role' AND n.nspname = current_schema()
      ORDER BY e.enumsortorder`;
    expect(rows.map(row => row.label)).toEqual(['ADMIN', 'MEMBER']);
  });

  it('has the unique User_username_lower_key expression index', async () => {
    const rows = await prisma.$queryRaw<{ unique: boolean; expression: string }[]>`
      SELECT i.indisunique AS unique, pg_get_expr(i.indexprs, i.indrelid) AS expression
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_class tbl ON tbl.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = tbl.relnamespace
      WHERE c.relname = 'User_username_lower_key' AND tbl.relname = 'User'
        AND n.nspname = current_schema()`;
    expect(rows).toEqual([{ unique: true, expression: 'lower(username)' }]);
  });

  it('allows exactly one of two concurrent case-insensitive username registrations', async () => {
    const prefix = randomUUID();
    const responses = await Promise.all(['Casey Lee', 'casey lee'].map((username, index) =>
      request(app).post('/api/auth/register').send({
        email: `${prefix}-${index}@real-tests.example`, password: 'Password123!', username,
      }),
    ));
    expect(responses.map(res => res.status).sort()).toEqual([201, 409]);
    expect(responses.find(res => res.status === 409)?.body).toEqual({ error: 'Username already taken' });
    expect(await prisma.user.count()).toBe(1);
  });

  it('allows exactly ten of twelve concurrent pending submissions by one member', async () => {
    const member = await createUser('MEMBER');
    const responses = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      request(app).post('/api/titles').set(as(member)).send({ name: `Concurrent ${index}`, mediaType: 'MOVIE' }),
    ));
    expect(responses.filter(res => res.status === 201)).toHaveLength(10);
    expect(responses.filter(res => res.status === 409)).toHaveLength(2);
    for (const response of responses.filter(res => res.status === 409)) {
      expect(response.body).toEqual({ error: 'You already have 10 titles waiting for approval. Wait for an admin to decide on some of them.' });
    }
    expect(await prisma.title.count({ where: { createdById: member.id, status: 'PENDING' } })).toBe(10);
  });

  // Migration deduplication is intentionally not tested here: this database migrates empty.
});
