import type { TitleSummary } from '@bingemate/shared';
import { MediaType, TitleStatus } from '@bingemate/shared';

/** Mock data for building UI before the API exists. Fictional titles; hue drives the placeholder poster. */
export interface MockTitle extends TitleSummary {
  year: number;
  hue: number;
}

export const mockTitles: MockTitle[] = [
  ['Last Light', 2016, 210, 4.1, MediaType.MOVIE],
  ['Last Light: Part Two', 2024, 25, 4.8, MediaType.MOVIE],
  ['Ember Run', 2021, 275, 3.9, MediaType.MOVIE],
  ['Isone', 2013, 200, 3.7, MediaType.MOVIE],
  ['Hollow City', 2014, 190, 4.0, MediaType.MOVIE],
  ['Neon Blade', 2017, 335, 4.2, MediaType.MOVIE],
  ['Cartel', 2015, 40, 3.8, MediaType.MOVIE],
].map(([name, year, hue, avgRating, mediaType], i) => ({
  id: `mock-${i + 1}`,
  name: name as string,
  year: year as number,
  hue: hue as number,
  mediaType: mediaType as MediaType,
  status: TitleStatus.APPROVED,
  avgRating: avgRating as number,
  reviewCount: 120 + i * 37,
}));
