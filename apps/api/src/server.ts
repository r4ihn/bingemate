import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectMongo, disconnectMongo } from './db/mongo.js';
import { prisma } from './db/prisma.js';
import { refreshIfEmpty, startTrendingTimer } from './jobs/refreshTrending.js';
import { createShutdown } from './utils/shutdown.js';

async function main() {
  await prisma.$connect();
  await connectMongo();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`🚀 API listening on http://localhost:${env.PORT}`);
    void refreshIfEmpty();
    const stopTrendingTimer = startTrendingTimer(env.TRENDING_REFRESH_MINUTES);
    const shutdown = createShutdown({
      server,
      stopTimers: stopTrendingTimer,
      disconnect: async () => {
        await prisma.$disconnect();
        await disconnectMongo();
      },
      exit: (code) => process.exit(code),
      log: (msg) => console.log(msg),
    });
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => {
        void shutdown(signal);
      });
    }
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
