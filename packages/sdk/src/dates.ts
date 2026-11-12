import type { ChangeFilterOptions, DateInput } from './types';

/**
 * Serializes a date for voucher endpoints, which accept a Unix timestamp
 * or a `dd.mm.yyyy` string.
 */
export function toVoucherDate(value: DateInput): string | number {
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  return value;
}

/** Serializes a date as ISO 8601, as expected by transaction endpoints. */
export function toIsoDateTime(value: DateInput): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    return new Date(value * 1000).toISOString();
  }
  return value;
}

/** Serializes a date as `YYYY-MM-DD`. */
export function toPlainDate(value: DateInput): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    return new Date(value * 1000).toISOString().slice(0, 10);
  }
  return value;
}

/**
 * Serializes a date as a Unix timestamp in seconds. Strings are passed through
 * unchanged.
 */
export function toUnixSeconds(value: DateInput): string | number {
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  return value;
}

/** Builds the query parameters of {@link ChangeFilterOptions}. */
export function changeFilterQuery(
  options: ChangeFilterOptions,
): Record<string, string | number | undefined> {
  const serialize = (value: ChangeFilterOptions[keyof ChangeFilterOptions]) =>
    value === undefined ? undefined : toUnixSeconds(value);
  return {
    createAfter: serialize(options.createAfter),
    createBefore: serialize(options.createBefore),
    updateAfter: serialize(options.updateAfter),
    updateBefore: serialize(options.updateBefore),
  };
}

/** sevdesk stores document dates as local midnight in German time. */
const SEVDESK_TIME_ZONE = 'Europe/Berlin';

const GERMAN_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UNIX_SECONDS = /^\d+$/;

const offsetFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: SEVDESK_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Offset of German time from UTC at an instant, in milliseconds. */
function germanOffset(instant: number): number {
  const parts = Object.fromEntries(
    offsetFormat
      .formatToParts(new Date(instant))
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const local = Date.UTC(
    parts['year']!,
    parts['month']! - 1,
    parts['day']!,
    parts['hour']!,
    parts['minute']!,
    parts['second']!,
  );
  return local - Math.floor(instant / 1000) * 1000;
}

/** Unix seconds of midnight in German time at the start of a calendar day. */
function germanMidnight(year: number, month: number, day: number): number {
  const utcMidnight = Date.UTC(year, month - 1, day);
  let instant = utcMidnight;
  // Two rounds settle the offset; midnight never falls into a DST gap.
  for (let round = 0; round < 2; round += 1) {
    instant = utcMidnight - germanOffset(instant);
  }
  return Math.floor(instant / 1000);
}

/** The calendar day of `dd.mm.yyyy` or `YYYY-MM-DD`, or `null`. */
function calendarDay(value: string): [number, number, number] | null {
  const german = GERMAN_DATE.exec(value);
  const plain = PLAIN_DATE.exec(value);
  const [year, month, day] = german
    ? [Number(german[3]), Number(german[2]), Number(german[1])]
    : plain
      ? [Number(plain[1]), Number(plain[2]), Number(plain[3])]
      : [Number.NaN, Number.NaN, Number.NaN];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
    ? [year, month, day]
    : null;
}

function toFilterSeconds(value: DateInput, edge: 'start' | 'end'): number {
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  if (typeof value === 'number') {
    return value;
  }
  const trimmed = value.trim();
  if (UNIX_SECONDS.test(trimmed)) {
    return Number(trimmed);
  }
  const day = calendarDay(trimmed);
  if (day) {
    const [year, month, date] = day;
    return edge === 'start'
      ? germanMidnight(year, month, date)
      : germanMidnight(year, month, date + 1) - 1;
  }
  const instant = trimmed.includes('T') ? Date.parse(trimmed) : Number.NaN;
  if (Number.isNaN(instant)) {
    throw new TypeError(
      `Cannot read the date "${value}". Use dd.mm.yyyy, YYYY-MM-DD, Unix seconds or an ISO 8601 timestamp.`,
    );
  }
  return Math.floor(instant / 1000);
}

/**
 * Serializes the start of a document-date filter (`startDate` on `/Voucher`,
 * `/Invoice`, `/Order` and `/CreditNote`) as Unix seconds, the only format
 * these filters honor: a `dd.mm.yyyy` string is accepted by the API but
 * ignored. A calendar day (`dd.mm.yyyy` or `YYYY-MM-DD`) becomes midnight in
 * German time, the time zone sevdesk stores document dates in.
 */
export function toFilterStart(value: DateInput): number {
  return toFilterSeconds(value, 'start');
}

/**
 * Serializes the end of a document-date filter like {@link toFilterStart}.
 * A calendar day becomes its last second in German time, so the whole day is
 * included both by the inclusive bounds of invoices and orders and by the
 * exclusive `endDate` of `/Voucher`.
 */
export function toFilterEnd(value: DateInput): number {
  return toFilterSeconds(value, 'end');
}
