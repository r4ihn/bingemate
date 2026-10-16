import type { Response } from 'express';
import { isProd } from '../config/env.js';

const COOKIE_NAME = 'token';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: TWO_HOURS_MS,
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}
