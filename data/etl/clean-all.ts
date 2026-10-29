import { rmSync } from 'node:fs';
import { main as books } from './clean-books.js';
import { main as genres } from './clean-genres.js';
import { main as lists } from './clean-lists.js';
import { main as movies } from './clean-movies.js';
import { main as people } from './clean-people.js';
import { main as reviews } from './clean-reviews.js';
import { main as tvshows } from './clean-tvshows.js';
import { main as users } from './clean-users.js';
import { LOG_DIR } from './lib/io.js';
import { main as verify } from './verify.js';

// Order matters: clean-lists reads the reviews that clean-reviews kept.
// summary.json and the reject files are rebuilt each run; etl.log keeps the full history.
rmSync(`${LOG_DIR}summary.json`, { force: true });
for (const step of [movies, tvshows, books, genres, people, users, reviews, lists]) step();
verify();
