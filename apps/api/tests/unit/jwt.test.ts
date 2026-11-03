import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';
const { env } = await import('../../src/config/env.js');
const { signToken, verifyToken } = await import('../../src/utils/jwt.js');
describe('JWT roles and usernames', () => {
  it.each(['CREATOR', 'CONSUMER'])('maps legacy %s tokens to MEMBER with a null username', role => {
    const token = jwt.sign({ sub: 'u1', email: 'me@example.com', role }, env.JWT_SECRET);
    expect(verifyToken(token)).toEqual({ id: 'u1', email: 'me@example.com', role: 'MEMBER', username: null });
  });
  it('rejects an unknown ROOT role', () => {
    expect(() => verifyToken(jwt.sign({ sub: 'u1', role: 'ROOT' }, env.JWT_SECRET))).toThrow();
  });
  it.each(['ADMIN', 'MEMBER'] as const)('preserves %s and the username in a new token', role => {
    const user = { id: 'u1', email: 'me@example.com', role, username: 'Casey Lee' };
    expect(verifyToken(signToken(user))).toEqual(user);
  });
});
