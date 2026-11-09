import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  connectionParamSchema,
  connectionQuerySchema,
  personParamSchema,
  searchQuerySchema,
} from './people.schema.js';
import type { ConnectionQuery, SearchQuery } from './people.schema.js';
import { getConnection, getPerson, searchPeople } from './people.service.js';

/** Mounted at /people. Public, like the titles they are credited on. */
export const peopleRouter: Router = Router();

peopleRouter.get(
  '/',
  validate(searchQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await searchPeople((req.query as unknown as SearchQuery).q));
  }),
);

peopleRouter.get(
  '/:id',
  validate(personParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await getPerson(req.params['id'] as string));
  }),
);

peopleRouter.get(
  '/:id/connection/:otherId',
  validate(connectionParamSchema, 'params'),
  validate(connectionQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { maxDepth } = req.query as unknown as ConnectionQuery;
    res.json(
      await getConnection(req.params['id'] as string, req.params['otherId'] as string, maxDepth),
    );
  }),
);
