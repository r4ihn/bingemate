import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { route, userOf } from '../../utils/asyncRoute.js';
import {
  replyBodySchema,
  replyIdParamSchema,
  replyListQuerySchema,
  reviewIdParamSchema,
} from './replies.schema.js';
import { createReply, deleteReply, listReplies, updateReply } from './replies.service.js';

/** Mounted at /reviews/:reviewId/replies */
export const reviewRepliesRouter: Router = Router({ mergeParams: true });

reviewRepliesRouter.get(
  '/',
  validate(reviewIdParamSchema, 'params'),
  validate(replyListQuerySchema, 'query'),
  route(async (req, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    res.json(await listReplies(req.params['reviewId'] as string, page, pageSize));
  }),
);

reviewRepliesRouter.post(
  '/',
  authenticate,
  validate(reviewIdParamSchema, 'params'),
  validate(replyBodySchema),
  route(async (req, res) => {
    res
      .status(201)
      .json(await createReply(userOf(req), req.params['reviewId'] as string, req.body.body));
  }),
);

/** Mounted at /replies */
export const repliesRouter: Router = Router();

repliesRouter.patch(
  '/:id',
  authenticate,
  validate(replyIdParamSchema, 'params'),
  validate(replyBodySchema),
  route(async (req, res) => {
    res.json(await updateReply(userOf(req), req.params['id'] as string, req.body.body));
  }),
);

repliesRouter.delete(
  '/:id',
  authenticate,
  validate(replyIdParamSchema, 'params'),
  route(async (req, res) => {
    await deleteReply(userOf(req), req.params['id'] as string);
    res.status(204).end();
  }),
);
