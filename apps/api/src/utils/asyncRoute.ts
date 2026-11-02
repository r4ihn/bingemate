import type { Request } from 'express';
import { HttpError } from '../middleware/errorHandler.js';

/** The signed-in user. Routes using this sit behind `authenticate`, so a miss is a wiring bug. */
export function userOf(req: Request) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}
