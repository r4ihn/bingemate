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

const USERNAME_SCRIPTS = {
  Latin: /\p{Script_Extensions=Latin}/u,
  Cyrillic: /\p{Script_Extensions=Cyrillic}/u,
  Greek: /\p{Script_Extensions=Greek}/u,
  Han: /\p{Script_Extensions=Han}/u,
  Hiragana: /\p{Script_Extensions=Hiragana}/u,
  Katakana: /\p{Script_Extensions=Katakana}/u,
  Hangul: /\p{Script_Extensions=Hangul}/u,
  Arabic: /\p{Script_Extensions=Arabic}/u,
  Hebrew: /\p{Script_Extensions=Hebrew}/u,
  Devanagari: /\p{Script_Extensions=Devanagari}/u,
  Thai: /\p{Script_Extensions=Thai}/u,
} as const;

// A pragmatic subset of Unicode TR39 confusables, not the full table.
const USERNAME_LOOKALIKES: Readonly<Record<string, string>> = {
  // Cyrillic
  а: 'a',
  в: 'b',
  е: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  ѕ: 's',
  і: 'i',
  ј: 'j',
  ԁ: 'd',
  ԛ: 'q',
  ԝ: 'w',
  ѵ: 'v',
  г: 'r',
  ь: 'b',
  // Greek
  α: 'a',
  β: 'b',
  ε: 'e',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
  // Latin small capitals and dotless forms
  ᴀ: 'a',
  ʙ: 'b',
  ᴄ: 'c',
  ᴅ: 'd',
  ᴇ: 'e',
  ꜰ: 'f',
  ɢ: 'g',
  ʜ: 'h',
  ɪ: 'i',
  ᴊ: 'j',
  ᴋ: 'k',
  ʟ: 'l',
  ᴍ: 'm',
  ɴ: 'n',
  ᴏ: 'o',
  ᴘ: 'p',
  ʀ: 'r',
  ꜱ: 's',
  ᴛ: 't',
  ᴜ: 'u',
  ᴠ: 'v',
  ᴡ: 'w',
  ʏ: 'y',
  ᴢ: 'z',
  ı: 'i',
  ȷ: 'j',
  ɡ: 'g',
  // Leetspeak
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
};

export function normalizeUsername(raw: string): string {
  return raw.trim().normalize('NFKC').replace(/\s+/gu, ' ');
}

export function usernameError(raw: string): string | null {
  const name = normalizeUsername(raw);
  const length = [...name].length;
  if (length < USERNAME_MIN || length > USERNAME_MAX) {
    return `Username must be between ${USERNAME_MIN} and ${USERNAME_MAX} characters`;
  }
  // Defer default-ignorable characters to the dedicated error below.
  if (!/^[\p{L}\p{N}\p{Default_Ignorable_Code_Point} _.-]+$/u.test(name)) {
    return 'Username may only contain letters, digits, spaces, underscores, hyphens and periods';
  }
  if (/\p{Default_Ignorable_Code_Point}/u.test(name)) {
    return 'Username cannot contain invisible characters';
  }
  if (!/^[\p{L}\p{N}].*[\p{L}\p{N}]$/u.test(name)) {
    return 'Username must start and end with a letter or digit';
  }
  const scripts = new Set<string>();
  for (const letter of name) {
    if (!/\p{L}/u.test(letter)) continue;
    const script = Object.entries(USERNAME_SCRIPTS).find(([, pattern]) => pattern.test(letter));
    if (!script) return 'Username contains letters from an unsupported alphabet';
    scripts.add(script[0]);
  }
  const japanese = ['Latin', 'Han', 'Hiragana', 'Katakana'];
  const korean = ['Latin', 'Han', 'Hangul'];
  if (
    scripts.size > 1 &&
    ![...scripts].every((script) => japanese.includes(script)) &&
    ![...scripts].every((script) => korean.includes(script))
  ) {
    return 'Username cannot mix letters from different alphabets';
  }
  const skeleton = [
    ...name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[ _.-]/gu, ''),
  ].map((character) => {
    const lookalike = USERNAME_LOOKALIKES[character];
    if (lookalike) return lookalike;
    // Conservatively cover unlisted Latin lookalikes only for reserved words.
    if (character.codePointAt(0)! > 0x7f && /\p{Script=Latin}/u.test(character)) return '?';
    return character;
  });
  if (
    RESERVED_USERNAMES.some(
      (reserved) =>
        reserved.length === skeleton.length &&
        skeleton.every((character, index) => character === '?' || character === reserved[index]),
    )
  ) {
    return 'This username is reserved';
  }
  return null;
}
