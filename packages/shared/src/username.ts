export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const RESERVED_USERNAMES = ['admin', 'administrator', 'moderator', 'bingemate', 'support', 'system'] as const;
export const MAX_PENDING_SUBMISSIONS = 10;

export function normalizeUsername(raw: string): string {
  return raw.trim().normalize('NFC').replace(/\s+/gu, ' ');
}

export function usernameError(raw: string): string | null {
  const name = normalizeUsername(raw);
  const length = [...name].length;
  if (length < USERNAME_MIN || length > USERNAME_MAX) {
    return `Username must be between ${USERNAME_MIN} and ${USERNAME_MAX} characters`;
  }
  if (!/^[\p{L}\p{N} _.-]+$/u.test(name)) {
    return 'Username may only contain letters, digits, spaces, underscores, hyphens and periods';
  }
  if (!/^[\p{L}\p{N}].*[\p{L}\p{N}]$/u.test(name)) {
    return 'Username must start and end with a letter or digit';
  }
  if (RESERVED_USERNAMES.some(reserved => reserved === name.toLowerCase())) {
    return 'This username is reserved';
  }
  return null;
}
