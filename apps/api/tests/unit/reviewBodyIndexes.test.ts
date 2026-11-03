import { describe, expect, it } from 'vitest';
import { ReviewBody } from '../../src/mongo/models/reviewBody.model.js';

describe('ReviewBody indexes', () => {
  it('declares the compound indexes for title reviews and top reviewers', () => {
    const keys = ReviewBody.schema.indexes().map(([fields]) => fields);

    expect(keys).toEqual(expect.arrayContaining([
      { titleId: 1, createdAt: -1 },
      { titleId: 1, userId: 1 },
      { mediaType: 1, titleId: 1, userId: 1 },
    ]));
  });

  it('omits the redundant titleId index and retains the userId index', () => {
    const keys = ReviewBody.schema.indexes().map(([fields]) => fields);

    expect(keys).not.toContainEqual({ titleId: 1 });
    expect(keys).toContainEqual({ userId: 1 });
  });
});
