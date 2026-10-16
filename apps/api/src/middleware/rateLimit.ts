import rateLimit from 'express-rate-limit';

/** Limiter for auth routes (login/register). Tune in TASKS.md section 3. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
});
