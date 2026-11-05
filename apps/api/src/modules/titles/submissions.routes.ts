import { Router } from 'express';
import { Role } from '@bingemate/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { userOf } from '../../utils/asyncRoute.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { createSubmissionSchema, updateSubmissionSchema } from './submissions.schema.js';
import { createSubmission, deleteTitle, updateSubmission } from './submissions.service.js';
import { idParamSchema } from './titles.schema.js';

/** Mounted at /titles. Only members can submit a title for approval. */
export const submissionsRouter: Router = Router();

submissionsRouter.post(
  '/',
  authenticate,
  authorize(Role.MEMBER),
  validate(createSubmissionSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createSubmission(userOf(req), req.body));
  }),
);

submissionsRouter.patch(
  '/:id',
  authenticate,
  authorize(Role.MEMBER),
  validate(idParamSchema, 'params'),
  validate(updateSubmissionSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateSubmission(userOf(req), req.params['id'] as string, req.body));
  }),
);

submissionsRouter.delete(
  '/:id',
  authenticate,
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    await deleteTitle(userOf(req), req.params['id'] as string);
    res.status(204).end();
  }),
);
