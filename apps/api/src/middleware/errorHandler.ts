import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'ValidationError', details: err.flatten() });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const type = (err as { type?: string } | null | undefined)?.type;
  switch (type) {
    case 'entity.parse.failed':
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    case 'entity.too.large':
      res.status(413).json({ error: 'Request body too large' });
      return;
    case 'encoding.unsupported':
    case 'charset.unsupported':
    case 'request.aborted':
      res.status(400).json({ error: 'Could not read the request' });
      return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'InternalServerError' });
};
