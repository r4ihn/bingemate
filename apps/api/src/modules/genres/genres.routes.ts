import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { genresQuerySchema } from './genres.schema.js';
import type { GenresQuery } from './genres.schema.js';
import { listGenreOptions } from './genres.service.js';

/** Mounted at /genres. Public. */
export const genresRouter: Router = Router();

genresRouter.get(
  '/',
  validate(genresQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await listGenreOptions(req.query as unknown as GenresQuery));
  }),
);
