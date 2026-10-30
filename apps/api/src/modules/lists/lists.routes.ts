import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { route, userOf } from '../../utils/asyncRoute.js';
import {
  addEntrySchema,
  entryIdParamSchema,
  listQuerySchema,
  setStatusSchema,
  titleIdParamSchema,
} from './lists.schema.js';
import type { ListQuery } from './lists.schema.js';
import { addEntry, entryForTitle, listMine, removeEntry, setEntryStatus } from './lists.service.js';

/** Mounted at /me/lists. Every route is the signed-in user's own list. */
export const listsRouter: Router = Router();
listsRouter.use(authenticate);

listsRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  route(async (req, res) => {
    res.json(await listMine(userOf(req), req.query as unknown as ListQuery));
  }),
);

listsRouter.get(
  '/by-title/:titleId',
  validate(titleIdParamSchema, 'params'),
  route(async (req, res) => {
    res.json(await entryForTitle(userOf(req), req.params['titleId'] as string));
  }),
);

listsRouter.post(
  '/',
  validate(addEntrySchema),
  route(async (req, res) => {
    res.status(201).json(await addEntry(userOf(req), req.body.titleId, req.body.status));
  }),
);

listsRouter.patch(
  '/:id',
  validate(entryIdParamSchema, 'params'),
  validate(setStatusSchema),
  route(async (req, res) => {
    res.json(await setEntryStatus(userOf(req), req.params['id'] as string, req.body.status));
  }),
);

listsRouter.delete(
  '/:id',
  validate(entryIdParamSchema, 'params'),
  route(async (req, res) => {
    await removeEntry(userOf(req), req.params['id'] as string);
    res.status(204).end();
  }),
);
