import { Router } from 'express';
import { Role } from '@bingemate/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { route, userOf } from '../../utils/asyncRoute.js';
import { createSubmissionSchema } from './submissions.schema.js';
import { createSubmission } from './submissions.service.js';

/** Mounted at /titles. Only creators can submit a title for approval. */
export const submissionsRouter: Router = Router();

submissionsRouter.post(
  '/',
  authenticate,
  authorize(Role.CREATOR),
  validate(createSubmissionSchema),
  route(async (req, res) => {
    res.status(201).json(await createSubmission(userOf(req), req.body));
  }),
);
