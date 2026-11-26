// Vercel serverless entry. One function serves every /api/* request (see the root vercel.json);
// server.ts stays the entry for local and long-running hosts.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';

// Serverless means many short-lived instances, so prefer the provider's pooled URL at runtime when it
// sets one. Migrations keep using the direct DATABASE_URL (prisma.config.ts). This must run before
// the app modules load, because the Prisma client reads DATABASE_URL when it is created.
if (process.env.DATABASE_URL_POOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_POOLED;

let appPromise: Promise<Express> | undefined;

/** Connects MongoDB once per instance. A failed attempt is forgotten so the next request retries. */
function getApp(): Promise<Express> {
  appPromise ??= (async () => {
    const [{ createApp }, { connectMongo }] = await Promise.all([
      import('./app.js'),
      import('./db/mongo.js'),
    ]);
    await connectMongo();
    const app = createApp();
    // Vercel's edge sets X-Forwarded-For; trust that one hop so rate limits key on the client IP.
    app.set('trust proxy', 1);
    return app;
  })().catch((err: unknown) => {
    appPromise = undefined;
    throw err;
  });
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let app: Express;
  try {
    app = await getApp();
  } catch (err) {
    console.error('API startup failed:', err);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Service unavailable' }));
    return;
  }
  app(req as Parameters<Express>[0], res as Parameters<Express>[1]);
}
