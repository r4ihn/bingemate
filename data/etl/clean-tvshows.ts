import { runIfMain } from './lib/io.js';
import { cleanMediaTitles } from './lib/titles.js';

export function main(): void {
  cleanMediaTitles({
    step: 'clean-tvshows',
    rawType: 'tv',
    mediaType: 'TV_SHOW',
    detailsFile: 'tv_details.csv',
    outFile: 'tv_shows.csv',
    details: [
      { name: 'num_seasons', kind: 'int', min: 1, max: 100 },
      { name: 'duration', kind: 'int', min: 1, max: 1000 },
      { name: 'metascore', kind: 'int', min: 0, max: 100 },
      { name: 'userscore', kind: 'int', min: 0, max: 100 },
      { name: 'content_rating', kind: 'text' },
    ],
  });
}

runIfMain(import.meta.url, main);
