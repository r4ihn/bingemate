import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client.js';
import { HttpError } from '../../src/middleware/errorHandler.js';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../src/db/prisma.js', () => ({ prisma: { user: { create } } }));
vi.mock('../../src/utils/password.js', () => ({ hashPassword: vi.fn().mockResolvedValue('hash') }));

const { authService } = await import('../../src/modules/auth/auth.service.js');
const register = () => authService.register('me@test.com', 'abc12345', 'Casey Lee');

beforeEach(() => {
  create.mockReset();
});

describe('register unique constraint errors', () => {
  it.each([
    { target: ['lower(username)'], message: 'Username already taken' },
    { target: ['LOWER(USERNAME)'], message: 'Username already taken' },
    { target: ['email'], message: 'Email already in use' },
    { target: ['User_email_key'], message: 'Email already in use' },
    { target: ['EMAIL'], message: 'Email already in use' },
    { target: ['username', 'email'], message: 'Email already in use' },
  ])('maps $target to $message', async ({ target, message }) => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { modelName: 'User', target },
      }),
    );

    await expect(register()).rejects.toEqual(new HttpError(409, message));
  });

  // Prisma 7's pg adapter leaves meta.target unset and names the constraint under
  // driverAdapterError (shape captured from a real PostgreSQL unique violation).
  const adapterMeta = (constraint: Record<string, unknown>) => ({
    modelName: 'User',
    driverAdapterError: {
      name: 'DriverAdapterError',
      cause: {
        originalCode: '23505',
        kind: 'UniqueConstraintViolation',
        constraint,
        table: 'User',
      },
    },
  });

  it.each([
    { constraint: { index: 'User_username_lower_key' }, message: 'Username already taken' },
    { constraint: { index: 'User_email_key' }, message: 'Email already in use' },
    { constraint: { fields: ['email'] }, message: 'Email already in use' },
  ])('maps adapter constraint $constraint to $message', async ({ constraint, message }) => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: adapterMeta(constraint),
      }),
    );

    await expect(register()).rejects.toEqual(new HttpError(409, message));
  });

  it.each([
    { modelName: 'User', target: ['something_else'] },
    adapterMeta({ index: 'something_else' }),
    undefined,
  ])('rethrows the original error for meta %j', async (meta) => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      ...(meta === undefined ? {} : { meta }),
    });
    create.mockRejectedValue(error);

    await expect(register()).rejects.toBe(error);
  });
});
