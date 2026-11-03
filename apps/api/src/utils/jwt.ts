import jwt from 'jsonwebtoken';
import type { AuthUser, Role } from '@bingemate/shared';
import { env } from '../config/env.js';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role | 'CREATOR' | 'CONSUMER';
  username?: string | null;
}

export function signToken(user: AuthUser): string {
  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, username: user.username };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as any });
}

export function verifyToken(token: string): AuthUser {
  const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  const role = decoded.role === 'CREATOR' || decoded.role === 'CONSUMER' ? 'MEMBER' : decoded.role;
  if (role !== 'ADMIN' && role !== 'MEMBER') throw new jwt.JsonWebTokenError('Invalid role');
  return { id: decoded.sub, email: decoded.email, role, username: decoded.username ?? null };
}
