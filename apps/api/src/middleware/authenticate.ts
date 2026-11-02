import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from '@bingemate/shared';
import { verifyToken } from '../utils/jwt.js';
import { HttpError } from './errorHandler.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Reads the JWT from the httpOnly cookie, verifies it, attaches req.user. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = (req.cookies?.token as string | undefined) ?? undefined;
  if (!token) {
    throw new HttpError(401, 'Not authenticated');
  }
  try {
    req.user = verifyToken(token);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  next();
}


/** Public routes may also use a valid session to grant private access. */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.token as string | undefined;
  if (token) {
    try { req.user = verifyToken(token); } catch { /* An invalid session grants no private access. */ }
  }
  next();
}
