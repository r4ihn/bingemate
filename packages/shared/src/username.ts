export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

export function normalizeUsername(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function usernameError(input: string): string | null {
  const name = normalizeUsername(input);

  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
    return `Username must be between ${USERNAME_MIN} and ${USERNAME_MAX} characters`;
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9_. -]*$/.test(name)) {
    return 'Username can contain only letters, digits, spaces, underscores, hyphens and dots';
  }

  if (/^(admin|administrator|root|support|moderator|system)$/i.test(name)) {
    return 'This username is reserved';
  }

  return null;
}