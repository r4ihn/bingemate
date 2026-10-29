import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { idParamSchema, listQuerySchema } from './titles.schema.js';
import type { ListQuery } from './titles.schema.js';
import { getTitle, listTitles } from './titles.service.js';

export const titlesRouter: Router = Router();

titlesRouter.get('/', validate(listQuerySchema, 'query'), async (req, res, next) => {
  try {
    res.json(await listTitles(req.query as unknown as ListQuery));
  } catch (err) {
    next(err);
  }
});

titlesRouter.get('/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    res.json(await getTitle(req.params['id'] as string));
  } catch (err) {
    next(err);
  }
});
