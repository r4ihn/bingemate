import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { route, userOf } from '../../utils/asyncRoute.js';
import {
  createReviewSchema,
  reviewIdParamSchema,
  reviewListQuerySchema,
  titleIdParamSchema,
  updateReviewSchema,
} from './reviews.schema.js';
import {
  createReview,
  deleteReview,
  listReviews,
  myReview,
  updateReview,
} from './reviews.service.js';

/** Mounted at /titles/:titleId/reviews */
export const titleReviewsRouter: Router = Router({ mergeParams: true });

titleReviewsRouter.get(
  '/',
  validate(titleIdParamSchema, 'params'),
  validate(reviewListQuerySchema, 'query'),
  route(async (req, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    res.json(await listReviews(req.params['titleId'] as string, page, pageSize));
  }),
);

titleReviewsRouter.get(
  '/mine',
  authenticate,
  validate(titleIdParamSchema, 'params'),
  route(async (req, res) => {
    res.json(await myReview(userOf(req), req.params['titleId'] as string));
  }),
);

titleReviewsRouter.post(
  '/',
  authenticate,
  validate(titleIdParamSchema, 'params'),
  validate(createReviewSchema),
  route(async (req, res) => {
    res
      .status(201)
      .json(await createReview(userOf(req), req.params['titleId'] as string, req.body));
  }),
);

/** Mounted at /reviews */
export const reviewsRouter: Router = Router();

reviewsRouter.patch(
  '/:id',
  authenticate,
  validate(reviewIdParamSchema, 'params'),
  validate(updateReviewSchema),
  route(async (req, res) => {
    res.json(await updateReview(userOf(req), req.params['id'] as string, req.body));
  }),
);

reviewsRouter.delete(
  '/:id',
  authenticate,
  validate(reviewIdParamSchema, 'params'),
  route(async (req, res) => {
    await deleteReview(userOf(req), req.params['id'] as string);
    res.status(204).end();
  }),
);
