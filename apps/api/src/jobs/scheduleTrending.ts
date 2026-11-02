import { refreshTrending } from './refreshTrending.js';

/** Run immediately and every minute. A slow refresh never overlaps the next tick. */
export function startTrendingRefresh() {
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try { await refreshTrending(); }
    catch (err) { console.error('Trending refresh failed; will retry:', err); }
    finally { running = false; }
  }
  void tick();
  const timer = setInterval(() => void tick(), 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
