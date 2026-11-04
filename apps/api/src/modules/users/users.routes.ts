import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Response } from 'express';
import type { ProfileDTO } from '@bingemate/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { userOf } from '../../utils/asyncRoute.js';
import { setAuthCookie } from '../../utils/authCookie.js';
import { signToken } from '../../utils/jwt.js';
import { changePasswordSchema, updateUsernameSchema } from './users.schema.js';
import { changePassword, getProfile, updateUsername } from './users.service.js';

/** Mounted at /users. Every route is about the signed-in user, taken from the token. */
export const usersRouter: Router = Router();

usersRouter.use(authenticate);

// Its own limiter (the login one is shared by register and login) because a stolen session could
// otherwise guess the current password.
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
});

/** The token carries the username and role, so a fresh one keeps this device's session accurate. */
function refreshSession(res: Response, p: ProfileDTO): void {
  setAuthCookie(res, signToken({ id: p.id, email: p.email, role: p.role, username: p.username }));
}

usersRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json(await getProfile(userOf(req).id));
  }),
);

usersRouter.patch(
  '/me',
  validate(updateUsernameSchema),
  asyncHandler(async (req, res) => {
    const { username } = req.body as { username: string };
    const profile = await updateUsername(userOf(req).id, username);
    refreshSession(res, profile);
    res.json(profile);
  }),
);

usersRouter.patch(
  '/me/password',
  passwordLimiter,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };
    refreshSession(res, await changePassword(userOf(req).id, currentPassword, newPassword));
    res.status(204).end();
  }),
);
