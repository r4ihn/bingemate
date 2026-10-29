import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { route } from '../../utils/asyncRoute.js';
import { trendingQuerySchema } from './trending.schema.js';
import type { TrendingQuery } from './trending.schema.js';
import { listTrending } from './trending.service.js';

/** Mounted at /trending. Public. */
export const trendingRouter: Router = Router();

trendingRouter.get(
  '/',
  validate(trendingQuerySchema, 'query'),
  route(async (req, res) => {
    res.json(await listTrending(req.query as unknown as TrendingQuery));
  }),
);
