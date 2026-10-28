export type Row = Record<string, string>;

/** RFC 4180 parser: quoted fields, embedded commas/newlines, "" escapes, CRLF, leading BOM. */
export function parseCsv(input: string): Row[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      // A quote inside an unquoted field (5" Floppy) is a literal character (RFC 4180).
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      field = '';
      record = [];
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error('CSV ended inside a quoted field');
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const [header, ...body] = records;
  if (!header) return [];
  return body
    .filter((r) => !(r.length === 1 && r[0] === ''))
    .map((r) => {
      if (r.length !== header.length) {
        throw new Error(`CSV row has ${r.length} fields, header has ${header.length}: ${r[0]}`);
      }
      return Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? '']));
    });
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','));
  return lines.join('\n') + '\n';
}
