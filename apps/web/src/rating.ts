/** Ratings are whole stars from RATING_MIN to RATING_MAX: one definition, shared with the API and the ETL. */
export { RATING_MIN, RATING_MAX } from '@bingemate/shared';

/** What each star count means, shown beside the stars. Index = star count. */
export const RATING_WORDS = ['', 'Hated it', 'Disliked it', 'It was fine', 'Liked it', 'Loved it'];
