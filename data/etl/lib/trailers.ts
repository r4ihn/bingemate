/** A YouTube video id: 11 characters of letters, digits, "-" and "_". */
export const YOUTUBE_KEY = /^[A-Za-z0-9_-]{11}$/;

type Video = { site: string; type: string; key: string; official?: boolean; iso_639_1?: string };

/**
 * The YouTube id of the best trailer among a title's TMDB videos, or null. A trailer beats a teaser,
 * an official video beats a fan upload, and English beats other languages; otherwise TMDB's order.
 */
export function pickTrailer(videos: Video[]): string | null {
  const rank = (v: Video) =>
    (v.type === 'Trailer' ? 0 : 4) + (v.official ? 0 : 2) + (v.iso_639_1 === 'en' ? 0 : 1);
  const usable = videos
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v.site === 'YouTube' && ['Trailer', 'Teaser'].includes(v.type))
    .filter(({ v }) => YOUTUBE_KEY.test(v.key))
    .sort((a, b) => rank(a.v) - rank(b.v) || a.i - b.i);
  return usable[0]?.v.key ?? null;
}
