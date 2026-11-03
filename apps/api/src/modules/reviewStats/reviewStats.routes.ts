import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  reviewActivityQuerySchema,
  titleIdParamSchema,
  topReviewersQuerySchema,
} from './reviewStats.schema.js';
import type { ReviewActivityQuery, TopReviewersQuery } from './reviewStats.schema.js';
import { reviewActivity, topReviewers } from './reviewStats.service.js';

/** Public statistics, mounted before the other title/review routers. */
export const reviewStatsRouter: Router = Router();
reviewStatsRouter.get(
  '/titles/:titleId/review-activity',
  validate(titleIdParamSchema, 'params'),
  validate(reviewActivityQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { months } = req.query as unknown as ReviewActivityQuery;
    res.json(await reviewActivity(req.params.titleId!, months));
  }),
);
reviewStatsRouter.get(
  '/reviews/top-reviewers',
  validate(topReviewersQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await topReviewers(req.query as unknown as TopReviewersQuery));
  }),
);
