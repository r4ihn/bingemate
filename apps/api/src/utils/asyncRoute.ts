import type { Request, RequestHandler, Response } from 'express';
import { HttpError } from '../middleware/errorHandler.js';

/** Express 4 does not catch rejected promises: this hands them to the error handler. */
export function route(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

/** The signed-in user. Routes using this sit behind `authenticate`, so a miss is a wiring bug. */
export function userOf(req: Request) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}
