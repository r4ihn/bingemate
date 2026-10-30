const NO_POSTER_REASON = 'Imported movie without a poster';

/**
 * A movie must have a poster to be shown. REJECTED keeps the row (and its reviews) but the API treats
 * anything not APPROVED as absent; approve it once a poster exists. With no poster source at all
 * (raw files are not committed) nothing is hidden, so every movie keeps the gradient.
 */
export function titleVisibility(
  mediaType: string,
  posterUrl: string | null,
  postersLoaded: boolean,
): { status: 'APPROVED' | 'REJECTED'; rejectionReason: string | null } {
  return postersLoaded && mediaType === 'MOVIE' && posterUrl === null
    ? { status: 'REJECTED', rejectionReason: NO_POSTER_REASON }
    : { status: 'APPROVED', rejectionReason: null };
}
