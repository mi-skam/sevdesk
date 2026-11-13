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
