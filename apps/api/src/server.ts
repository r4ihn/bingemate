import { startTrendingRefresh } from './jobs/scheduleTrending.js';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectMongo } from './db/mongo.js';
import { prisma } from './db/prisma.js';
import { refreshIfEmpty, startTrendingTimer } from './jobs/refreshTrending.js';

async function main() {
  await prisma.$connect();
  await connectMongo();

  startTrendingRefresh();
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`🚀 API listening on http://localhost:${env.PORT}`);
    void refreshIfEmpty();
    const stopTrendingTimer = startTrendingTimer(env.TRENDING_REFRESH_MINUTES);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => {
        stopTrendingTimer();
        process.exit(0);
      });
    }
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
