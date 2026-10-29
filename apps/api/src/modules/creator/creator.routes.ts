import { Router } from 'express';
import { Role } from '@bingemate/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { route, userOf } from '../../utils/asyncRoute.js';
import { statsForCreator } from './creator.service.js';

/** Mounted at /creator. Creators only. */
export const creatorRouter: Router = Router();
creatorRouter.use(authenticate, authorize(Role.CREATOR));

creatorRouter.get(
  '/stats',
  route(async (req, res) => {
    res.json(await statsForCreator(userOf(req)));
  }),
);
