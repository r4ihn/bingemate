import { describe, expect, it } from 'vitest';
import request from 'supertest';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

const { createApp } = await import('../../src/app.js');

describe('health', () => {
  it('GET /health returns ok', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api returns service banner', async () => {
    const res = await request(createApp()).get('/api');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('bingemate-api');
  });
});
