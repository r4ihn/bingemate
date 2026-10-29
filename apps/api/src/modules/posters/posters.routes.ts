import express, { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { HttpError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { route, userOf } from '../../utils/asyncRoute.js';
import { MAX_IMAGE_BYTES } from './image.js';
import { deletePoster, getPoster, putPoster } from './posters.service.js';

const titleIdParamSchema = z.object({ titleId: z.string().min(1).max(40) });

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many uploads, try again later' },
});

/**
 * Reads the request body as bytes whatever its Content-Type says (the service checks the bytes),
 * and turns the parser's own errors into plain answers.
 */
function rawImage(req: Request, res: Response, next: NextFunction): void {
  express.raw({ type: () => true, limit: MAX_IMAGE_BYTES })(req, res, (err?: unknown) => {
    if (!err) return next();
    const type = (err as { type?: string }).type;
    next(
      type === 'entity.too.large'
        ? new HttpError(413, 'The image must be 1 MB or smaller')
        : new HttpError(400, 'Could not read the image'),
    );
  });
}

/** Mounted at /titles/:titleId/poster */
export const posterRouter: Router = Router({ mergeParams: true });

posterRouter.get(
  '/',
  validate(titleIdParamSchema, 'params'),
  route(async (req, res) => {
    const { contentType, data } = await getPoster(req.params['titleId'] as string);
    res
      .set({
        'Content-Type': contentType,
        // the URL carries ?v=<version>, so a changed image is a new URL and this copy never goes stale
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(data);
  }),
);

// The limiter and the sign-in check run before the body is read, so a stranger cannot make us buffer 1 MB.
posterRouter.put(
  '/',
  uploadLimiter,
  authenticate,
  validate(titleIdParamSchema, 'params'),
  rawImage,
  route(async (req, res) => {
    res.json(await putPoster(userOf(req), req.params['titleId'] as string, req.body));
  }),
);

posterRouter.delete(
  '/',
  uploadLimiter,
  authenticate,
  validate(titleIdParamSchema, 'params'),
  route(async (req, res) => {
    await deletePoster(userOf(req), req.params['titleId'] as string);
    res.status(204).end();
  }),
);
