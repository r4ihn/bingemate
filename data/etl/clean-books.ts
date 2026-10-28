import { runIfMain } from './lib/io.js';
import { cleanMediaTitles } from './lib/titles.js';

export function main(): void {
  cleanMediaTitles({
    step: 'clean-books',
    rawType: 'book',
    mediaType: 'BOOK',
    detailsFile: 'book_details.csv',
    outFile: 'books.csv',
    details: [
      { name: 'publisher', kind: 'text' },
      { name: 'price', kind: 'number', min: 0 },
      { name: 'ratings_count', kind: 'int', min: 0 },
    ],
  });
}

runIfMain(import.meta.url, main);
