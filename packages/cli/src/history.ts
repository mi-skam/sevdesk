/** Fields that change with nearly every update and say nothing on their own. */
const IGNORED = new Set(['update']);

const MAX_VALUE_LENGTH = 60;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function show(value: unknown): string {
  if (value === null || value === undefined) {
    return '–';
  }
  const text =
    typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > MAX_VALUE_LENGTH
    ? `${text.slice(0, MAX_VALUE_LENGTH - 1)}…`
    : text;
}

/** The changed leaves between two values, as `[path, before, after]`. */
function diff(
  before: unknown,
  after: unknown,
  path: string,
): Array<[string, unknown, unknown]> {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys
      .filter((key) => !(path === '' && IGNORED.has(key)))
      .flatMap((key) =>
        diff(before[key], after[key], path === '' ? key : `${path}.${key}`),
      );
  }
  return JSON.stringify(before) === JSON.stringify(after)
    ? []
    : [[path, before, after]];
}

/**
 * `status: 100 → 1000; contact.name: ACME → ACME GmbH` between two versions
 * of a record. Nested objects are compared field by field; the `update`
 * timestamp is left out. Empty when nothing else changed.
 */
export function describeChanges(previous: unknown, current: unknown): string {
  return diff(previous, current, '')
    .map(([path, before, after]) => `${path}: ${show(before)} → ${show(after)}`)
    .join('; ');
}

/** Fields that identify a record, most specific first. */
const IDENTIFIERS = [
  'invoiceNumber',
  'orderNumber',
  'creditNoteNumber',
  'partNumber',
  'number',
  'description',
  'name',
  'value',
  'street',
];

/** Fields naming the other party. */
const PARTIES = [
  'contact',
  'supplier',
  'supplierName',
  'payeePayerName',
  'contactName',
];

const MAX_LABEL_LENGTH = 80;

function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }
  if (typeof value === 'object' && value !== null) {
    const ref = value as Record<string, unknown>;
    const person = [ref['surename'], ref['familyname']]
      .filter(Boolean)
      .join(' ');
    return text(ref['name']) || person;
  }
  return '';
}

/**
 * A short human label for a stored record, such as `RE-1065 · 1428 · ACME
 * GmbH` for an invoice or `-18.07 · ACME GmbH · RE-1` for a transaction:
 * its number or name, amount, other party and payment purpose, whichever it
 * has. Empty when it has none of them.
 */
export function recordLabel(record: unknown): string {
  if (typeof record !== 'object' || record === null) {
    return '';
  }
  const fields = record as Record<string, unknown>;
  const first = (keys: readonly string[]) =>
    keys.map((key) => text(fields[key])).find((value) => value !== '') ?? '';
  const isContact = fields['objectName'] === 'Contact';
  const parts = [
    isContact ? text(fields) : first(IDENTIFIERS),
    first(['sumGross', 'amount', 'price']),
    isContact ? '' : first(PARTIES),
    text(fields['paymtPurpose']),
  ];
  const label = [...new Set(parts.filter((part) => part !== ''))].join(' · ');
  return label.length > MAX_LABEL_LENGTH
    ? `${label.slice(0, MAX_LABEL_LENGTH - 1)}…`
    : label;
}
