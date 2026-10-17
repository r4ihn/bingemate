import type { TitleSummary } from '@bingemate/shared';
import { MediaType, TitleStatus } from '@bingemate/shared';

/** Mock data for building UI before the API exists. Fictional titles; hue drives the placeholder poster. */
export interface MockTitle extends TitleSummary {
  year: number;
  hue: number;
}

export const mockTitles: MockTitle[] = [
  ['Last Light', 2016, 210, 8.1, MediaType.MOVIE],
  ['Last Light: Part Two', 2024, 25, 9.6, MediaType.MOVIE],
  ['Ember Run', 2021, 275, 7.8, MediaType.MOVIE],
  ['Isone', 2013, 200, 7.4, MediaType.MOVIE],
  ['Hollow City', 2014, 190, 8.0, MediaType.MOVIE],
  ['Neon Blade', 2017, 335, 8.3, MediaType.MOVIE],
  ['Cartel', 2015, 40, 7.6, MediaType.MOVIE],
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

export const featuredTitle = {
  name: 'Last Light: Part Two',
  synopsis:
    'Placeholder synopsis. A fugitive pilot joins the desert nomads on a campaign against the order that erased her home, and must choose between her future and the world she is trying to save.',
  rating: 9.6,
  countries: ['Usa', 'Canada'],
  studio: 'North Star Pictures',
  runtime: '2h 46min',
  person: 'Ines Calloway',
};
