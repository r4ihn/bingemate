import { Router } from 'express';
import { Role } from '@bingemate/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { idParamSchema } from '../titles/titles.schema.js';
import { adminTitlesQuerySchema, setTitleStatusSchema } from './adminTitles.schema.js';
import type { AdminTitlesQuery } from './adminTitles.schema.js';
import { listTitlesForReview, setTitleStatus } from './adminTitles.service.js';

/** Mounted at /admin/titles. Admins only. */
export const adminTitlesRouter: Router = Router();
adminTitlesRouter.use(authenticate, authorize(Role.ADMIN));

adminTitlesRouter.get(
  '/',
  validate(adminTitlesQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await listTitlesForReview(req.query as unknown as AdminTitlesQuery));
  }),
);

adminTitlesRouter.patch(
  '/:id/status',
  validate(idParamSchema, 'params'),
  validate(setTitleStatusSchema),
  asyncHandler(async (req, res) => {
    res.json(
      await setTitleStatus(
        req.params['id'] as string,
        req.body.status,
        new Date(req.body.updatedAt),
        req.body.rejectionReason,
      ),
    );
  }),
);
