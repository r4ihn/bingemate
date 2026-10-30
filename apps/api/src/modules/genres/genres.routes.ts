import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { route } from '../../utils/asyncRoute.js';
import { genresQuerySchema } from './genres.schema.js';
import type { GenresQuery } from './genres.schema.js';
import { listGenreOptions } from './genres.service.js';

/** Mounted at /genres. Public. */
export const genresRouter: Router = Router();

genresRouter.get(
  '/',
  validate(genresQuerySchema, 'query'),
  route(async (req, res) => {
    res.json(await listGenreOptions(req.query as unknown as GenresQuery));
  }),
);
