import type { Scenario } from '../lib/scenario.js';
import reviews from './reviews-for-title.js';
import trending from './top-n-trending.js';
import insert from './insert-review.js';
import replies from './replies-of-review.js';
import browse from './filtered-browse.js';

const scenarios: Scenario[] = [reviews, trending, insert, replies, browse];
export default scenarios;
