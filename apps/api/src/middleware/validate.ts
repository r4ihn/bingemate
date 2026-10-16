import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

type Part = 'body' | 'query' | 'params';

/** validate(schema, 'body') — parses and replaces req[part] with the typed result. */
export function validate(schema: ZodSchema, part: Part = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.parse(req[part]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[part] = parsed;
    next();
  };
}
