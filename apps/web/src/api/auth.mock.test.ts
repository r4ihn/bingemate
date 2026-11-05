import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, usernameError, USERNAME_MAX } from '@bingemate/shared';
import { authApi } from './auth.js';
import { db, resetDb } from '../mocks/db.js';

beforeEach(() => resetDb());

describe('mock registration', () => {
  const body = { email: 'new@example.com', password: 'abcdefg1', username: '  New  Member  ' };

  it('normalises and stores the username on the member without fetching', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    try {
      const user = await authApi.register(body);
      expect(user).toMatchObject({ email: body.email, username: 'New Member', role: Role.MEMBER });
      expect(db.users.find((u) => u.id === user.id)).toMatchObject(user);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      fetcher.mockRestore();
    }
  });

  it.each(['', 'ab', 'a'.repeat(USERNAME_MAX + 1), 'bad!name', 'ADMIN', '_starts'])(
    'rejects invalid username %j',
    async (username) => {
      const count = db.users.length;
      await expect(authApi.register({ ...body, username })).rejects.toMatchObject({
        status: 400,
        message: usernameError(username),
      });
      expect(db.users).toHaveLength(count);
    },
  );

  it('rejects a case-insensitive collision with a seeded username', async () => {
    await expect(
      authApi.register({ ...body, username: db.users[1]!.username!.toUpperCase() }),
    ).rejects.toMatchObject({ status: 409, message: 'Username already taken' });
  });

  it('rejects a normalised case-insensitive collision with a new username', async () => {
    await authApi.register(body);
    await expect(
      authApi.register({ ...body, email: 'other@example.com', username: 'new   MEMBER' }),
    ).rejects.toMatchObject({ status: 409, message: 'Username already taken' });
  });

  it('preserves the email conflict message', async () => {
    await expect(authApi.register({ ...body, email: db.users[0]!.email })).rejects.toMatchObject({
      status: 409,
      message: 'Email already in use',
    });
  });
});
