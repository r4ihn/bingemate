import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { authorize } from '../../src/middleware/authorize.js';
import { HttpError } from '../../src/middleware/errorHandler.js';

// Runs the middleware directly with a fake request, no server needed.
function run(roles: Parameters<typeof authorize>, user?: Request['user']) {
  const next = vi.fn();
  const req = { user } as Request;
  try {
    authorize(...roles)(req, {} as Response, next);
    return { next, status: undefined };
  } catch (err) {
    return { next, status: err instanceof HttpError ? err.status : 'not an HttpError' };
  }
}

const user = (role: 'MEMBER' | 'ADMIN') => ({ id: 'u1', email: 'a@b.c', username: null, role });

describe('authorize', () => {
  it('returns 401 when no user is signed in', () => {
    expect(run(['ADMIN']).status).toBe(401);
  });

  it.each([
    [['ADMIN'], 'ADMIN', undefined],
    [['ADMIN'], 'MEMBER', 403],
    [['MEMBER'], 'MEMBER', undefined],
    [['MEMBER'], 'ADMIN', 403],
    [['ADMIN', 'MEMBER'], 'MEMBER', undefined],
  ] as const)('authorize(%j) with a %s gives %s', (roles, role, expected) => {
    const { next, status } = run([...roles], user(role));

    expect(status).toBe(expected);
    expect(next).toHaveBeenCalledTimes(expected === undefined ? 1 : 0);
  });
});
