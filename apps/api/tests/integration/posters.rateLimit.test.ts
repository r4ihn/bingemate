import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

vi.mock('../../src/db/prisma.js', () => ({ prisma: {} }));
vi.mock('../../src/mongo/models/titlePoster.model.js', () => ({ TitlePoster: {} }));

const { createApp } = await import('../../src/app.js');

// In its own file so the counter starts at zero: the limit is per process, per address.
describe('upload rate limit', () => {
  it('answers 429 after 30 upload attempts in a window, before reading any body', async () => {
    const app = createApp();
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await request(app)
        .put('/api/titles/t1/poster')
        .set('Content-Type', 'image/png')
        .send(Buffer.from([0x89, 0x50]));
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 30).every((s) => s === 401)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
