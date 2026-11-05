import { z } from 'zod';
import { normalizeUsername, passwordProblem, usernameError } from '@bingemate/shared';

/**
 * Body of PATCH /users/me. The name is normalised and checked with the same shared rules as signup.
 * `.strict()` so a body can never try to set `role` or anything else.
 */
export const updateUsernameSchema = z
  .object({
    username: z
      .string()
      .transform(normalizeUsername)
      .superRefine((value, ctx) => {
        const message = usernameError(value);
        if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      }),
  })
  .strict();

/** Body of PATCH /users/me/password. The new password follows the same rule as signup. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().superRefine((value, ctx) => {
      const message = passwordProblem(value);
      if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }),
  })
  .strict();
