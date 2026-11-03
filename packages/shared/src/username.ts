export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const RESERVED_USERNAMES = [
  'admin',
  'administrator',
  'moderator',
  'bingemate',
  'support',
  'system',
] as const;
export const MAX_PENDING_SUBMISSIONS = 10;

export function normalizeUsername(raw: string): string {
  return raw.trim().normalize('NFKC').replace(/\s+/gu, ' ');
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
  const scripts = [/\p{Script=Latin}/u, /\p{Script=Cyrillic}/u, /\p{Script=Greek}/u];
  if (scripts.filter((script) => script.test(name)).length > 1) {
    return 'Username cannot mix Latin, Cyrillic and Greek letters';
  }
  const lowerName = name.toLowerCase().normalize('NFKC');
  const compactName = lowerName.replace(/[ _.-]/gu, '');
  if (RESERVED_USERNAMES.some((reserved) => reserved === lowerName || reserved === compactName)) {
    return 'This username is reserved';
  }
  return null;
}
