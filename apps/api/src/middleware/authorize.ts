import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@bingemate/shared';
import { HttpError } from './errorHandler.js';

/** authorize('ADMIN', 'CREATOR') — requires req.user set by authenticate. */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new HttpError(401, 'Not authenticated');
    }
    if (!roles.includes(req.user.role)) {
      throw new HttpError(403, 'Forbidden');
    }
    next();
  };
}
