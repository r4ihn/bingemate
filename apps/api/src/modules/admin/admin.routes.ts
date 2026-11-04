import { Router } from 'express';
import { Role } from '@bingemate/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { userOf } from '../../utils/asyncRoute.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import type { PageParams } from '../../utils/pagination.js';
import { pageQuerySchema, setRoleSchema, userIdParamSchema } from './admin.schemas.js';
import { listAllReviews, listUsers, setUserRole } from './admin.service.js';

/** Mounted at /admin. Admins only: every route below sits behind this guard. */
export const adminRouter: Router = Router();
adminRouter.use(authenticate, authorize(Role.ADMIN));

adminRouter.get(
  '/users',
  validate(pageQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await listUsers(req.query as unknown as PageParams));
  }),
);

adminRouter.patch(
  '/users/:id/role',
  validate(userIdParamSchema, 'params'),
  validate(setRoleSchema),
  asyncHandler(async (req, res) => {
    res.json(await setUserRole(userOf(req), req.params['id'] as string, req.body.role));
  }),
);

adminRouter.get(
  '/reviews',
  validate(pageQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await listAllReviews(req.query as unknown as PageParams));
  }),
);
