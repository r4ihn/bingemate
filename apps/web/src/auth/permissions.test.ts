import { describe, expect, it } from 'vitest';
import { Role } from '@bingemate/shared';
import { canDelete } from './permissions.js';

const user = (id: string, role: Role) => ({ id, email: 'x@y.z', role });

describe('canDelete', () => {
  it('lets the author delete their own content', () => {
    expect(canDelete(user('u1', Role.CONSUMER), 'u1')).toBe(true);
  });
  it("blocks other users, including creators, from deleting someone else's content", () => {
    expect(canDelete(user('u2', Role.CONSUMER), 'u1')).toBe(false);
    expect(canDelete(user('u2', Role.CREATOR), 'u1')).toBe(false);
  });
  it('lets an admin delete anything', () => {
    expect(canDelete(user('admin', Role.ADMIN), 'u1')).toBe(true);
  });
  it('blocks anonymous visitors', () => {
    expect(canDelete(null, 'u1')).toBe(false);
  });
});
