import { MediaType } from '@bingemate/shared';

export const MEDIA_LABEL: Record<MediaType, string> = {
  [MediaType.MOVIE]: 'Movie',
  [MediaType.BOOK]: 'Book',
  [MediaType.TV_SHOW]: 'TV show',
};

/** Media type filter choices shared by Browse and the nav search; `undefined` means all types. */
export const MEDIA_FILTERS: { value: MediaType | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: MediaType.MOVIE, label: 'Movies' },
  { value: MediaType.TV_SHOW, label: 'TV' },
  { value: MediaType.BOOK, label: 'Books' },
];
