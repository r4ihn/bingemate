import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { creatorRouter } from './modules/creator/creator.routes.js';
import { genresRouter } from './modules/genres/genres.routes.js';
import { listsRouter } from './modules/lists/lists.routes.js';
import { repliesRouter, reviewRepliesRouter } from './modules/replies/replies.routes.js';
import { posterRouter } from './modules/posters/posters.routes.js';
import { reviewsRouter, titleReviewsRouter } from './modules/reviews/reviews.routes.js';
import { titlesRouter } from './modules/titles/titles.routes.js';

/**
 * Mounts all module routers under /api.
 * Feature modules (auth, titles, reviews, …) register here as they land —
 * see ARCHITECTURE.md and TASKS.md sections 3–7.
 */
export const router: Router = Router();

router.get('/', (_req, res) => {
  res.json({ service: 'bingemate-api', version: '0.1.0' });
});

router.use('/auth', authRouter);
router.use('/titles/:titleId/reviews', titleReviewsRouter);
router.use('/titles/:titleId/poster', posterRouter);
router.use('/titles', titlesRouter);
router.use('/reviews/:reviewId/replies', reviewRepliesRouter);
router.use('/reviews', reviewsRouter);
router.use('/replies', repliesRouter);
router.use('/me/lists', listsRouter);
router.use('/genres', genresRouter);
router.use('/creator', creatorRouter);
// ...
