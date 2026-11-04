import { cleanText, toInt, toNumber } from './clean.js';
import type { Row } from './csv.js';

/** A title with no detail values gets no row, so `details` stays null instead of an empty object. */
function unlessBlank<T extends { titleId: string }>(row: T): T | null {
  const hasValue = Object.entries(row).some(([key, value]) => key !== 'titleId' && value !== null);
  return hasValue ? row : null;
}

export function movieDetailsRow(t: Row, titleId: string) {
  return unlessBlank({
    titleId,
    runtimeMin: toInt(t['runtime_min']),
    tagline: cleanText(t['tagline']),
    rated: cleanText(t['rated']),
    letterboxdRating: toNumber(t['letterboxd_rating']),
  });
}

export function tvDetailsRow(t: Row, titleId: string) {
  return unlessBlank({
    titleId,
    numSeasons: toInt(t['num_seasons']),
    duration: toInt(t['duration']),
    contentRating: cleanText(t['content_rating']),
    metascore: toInt(t['metascore']),
    userscore: toInt(t['userscore']),
  });
}

export function bookDetailsRow(t: Row, titleId: string) {
  return unlessBlank({
    titleId,
    publisher: cleanText(t['publisher']),
    ratingsCount: toInt(t['ratings_count']),
  });
}
