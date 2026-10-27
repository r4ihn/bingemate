/** Single-line text: NFC, NBSP and zero-width characters out, whitespace collapsed, empty -> null. */
export function cleanText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const s = value
    .normalize('NFC')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[\u0085\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s === '' ? null : s;
}

/**
 * Multi-line text (review bodies): keeps line breaks but trims each line, drops the
 * hard-wrap indentation, turns CRLF into LF and caps blank runs at one blank line.
 */
export function cleanMultiline(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const s = value
    .normalize('NFC')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[\u0085\u2028\u2029]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s === '' ? null : s;
}

export function toInt(value: string | null | undefined): number | null {
  const s = cleanText(value);
  if (s === null || !/^-?\d+$/.test(s)) return null;
  return Number(s);
}

export function toNumber(value: string | null | undefined): number | null {
  const s = cleanText(value);
  if (s === null || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Strict YYYY-MM-DD that is a real calendar date, else null. */
export function toIsoDate(value: string | null | undefined): string | null {
  const s = cleanText(value);
  if (s === null || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** Whole stars 1 to 5 from the datasets' 0 to 10 scores: ceil(score / 2), floored at 1. */
export function toStars(score: number): number {
  return Math.min(5, Math.max(1, Math.ceil(score / 2)));
}
