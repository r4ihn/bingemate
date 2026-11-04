/** Password rule for changing a password; the same rule signup applies (8+ characters, a letter and a number). */

export const PASSWORD_MIN = 8;

/** Shown under the new password field. */
export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters, with a letter and a number.`;

/** The problem with a new password, or null when it is acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain a letter and a number';
  }
  return null;
}
