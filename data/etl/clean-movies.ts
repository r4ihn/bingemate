import { runIfMain } from './lib/io.js';
import { cleanMediaTitles } from './lib/titles.js';

export function main(): void {
  cleanMediaTitles({
    step: 'clean-movies',
    rawType: 'movie',
    mediaType: 'MOVIE',
    detailsFile: 'movie_details.csv',
    outFile: 'movies.csv',
    details: [
      { name: 'runtime_min', kind: 'int', min: 1, max: 1000 },
      { name: 'tagline', kind: 'text' },
      { name: 'letterboxd_rating', kind: 'number', min: 0, max: 5 },
      { name: 'rated', kind: 'text' },
    ],
  });
}

runIfMain(import.meta.url, main);
