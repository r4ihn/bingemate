import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db/prisma.js';
import { createTitle, resetDatabases } from './helpers.js';

beforeEach(resetDatabases);

describe('real Title.trailerKey CHECK', () => {
  it('accepts a YouTube id or NULL and refuses anything else', async () => {
    const title = await createTitle();
    const set = (trailerKey: string | null) =>
      prisma.title.update({ where: { id: title.id }, data: { trailerKey } });

    await expect(set('dQw4w9WgXcQ')).resolves.toMatchObject({ trailerKey: 'dQw4w9WgXcQ' });
    await expect(set(null)).resolves.toMatchObject({ trailerKey: null });
    for (const bad of ['short', 'dQw4w9WgXcQ1', '"><script>', 'https://youtu.be/x']) {
      await expect(set(bad), bad).rejects.toThrow(/Title_trailerKey_format/);
    }
  });
});
