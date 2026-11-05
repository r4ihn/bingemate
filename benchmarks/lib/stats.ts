/** Nearest-rank percentiles, including the median; never mutates the samples. */
export function summarize(samplesMs: number[]): {
  runs: number;
  median: number;
  p95: number;
  max: number;
  min: number;
} {
  if (!samplesMs.length) throw new Error('Cannot summarize empty samples');
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.ceil(p * sorted.length) - 1]!;
  return {
    runs: sorted.length,
    median: percentile(0.5),
    p95: percentile(0.95),
    max: sorted[sorted.length - 1]!,
    min: sorted[0]!,
  };
}
