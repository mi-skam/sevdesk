/**
 * A contact reference as returned by the API. The name fields are only present
 * when the reference was inflated with the `embed` query parameter.
 */
export interface ContactLike {
  id: string;
  name?: string | null;
  surename?: string | null;
  familyname?: string | null;
}

/** Formats a contact reference as its organization or person name. */
export function contactLabel(ref: ContactLike | null | undefined): string {
  if (!ref) {
    return '-';
  }
  const personName = [ref.surename, ref.familyname]
    .filter((part) => part)
    .join(' ');
  return ref.name || personName || ref.id || '-';
}

/**
 * Formats a service period (Leistungszeitraum) as plain dates, collapsing to a
 * single date when there is no end. The API returns local datetimes, so the
 * date part is sliced off instead of parsed, which would shift the day across
 * the UTC boundary.
 */
export function servicePeriodLabel(
  from: string | null | undefined,
  until: string | null | undefined,
): string {
  if (!from) {
    return '';
  }
  const start = from.slice(0, 10);
  return until ? `${start} – ${until.slice(0, 10)}` : start;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/** Code point ranges a terminal draws two columns wide (East Asian Wide and Fullwidth). */
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0x303e], // CJK radicals, punctuation
  [0x3041, 0x33ff], // Kana, CJK symbols
  [0x3400, 0x4dbf], // CJK extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xa000, 0xa4cf], // Yi
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe30, 0xfe4f], // CJK compatibility forms
  [0xff00, 0xff60], // Fullwidth forms
  [0xffe0, 0xffe6], // Fullwidth signs
  [0x20000, 0x3fffd], // CJK extensions B and later
];

const segmenter = new Intl.Segmenter();

/**
 * The number of terminal columns a string occupies: CJK, fullwidth characters
 * and emoji take two, combining marks none. `String#length` counts UTF-16 code
 * units instead, which misaligns table columns.
 */
export function displayWidth(value: string): number {
  let width = 0;
  for (const { segment } of segmenter.segment(value)) {
    const codePoint = segment.codePointAt(0) ?? 0;
    if (/^\p{Extended_Pictographic}/u.test(segment) && codePoint > 0xff) {
      width += 2;
    } else if (
      WIDE_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to)
    ) {
      width += 2;
    } else if (!/^[\p{Mn}\p{Me}\p{Cf}]/u.test(segment)) {
      width += 1;
    }
  }
  return width;
}

function padDisplayEnd(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - displayWidth(value)));
}

export function printTable(rows: Array<Record<string, string>>): void {
  const first = rows[0];
  if (!first) {
    return;
  }
  const columns = Object.keys(first);
  const widths = columns.map((column) =>
    Math.max(
      column.length,
      ...rows.map((row) => displayWidth(row[column] ?? '')),
    ),
  );
  const line = (values: string[]): string =>
    values
      .map((value, index) => padDisplayEnd(value, widths[index] ?? 0))
      .join('  ');
  console.log(line(columns.map((column) => column.toUpperCase())));
  for (const row of rows) {
    console.log(line(columns.map((column) => row[column] ?? '')));
  }
}
