import type { ModelRefResponse } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import type { ChangeFilterArguments } from './change-filters';
import { parseMoment } from './change-filters';
import { withStore } from './store';

/** The `--local` option shared by every command that can read the database. */
export const localOption = {
  local: z
    .boolean()
    .default(false)
    .describe(
      'Read from the local database (see `sevdesk db:sync`) instead of the API: no requests, and records deleted in sevdesk stay visible in get commands.',
    ),
};

/** Every live (not deleted) record of an entity, in ascending ID order. */
export async function readLocal<T>(entity: string): Promise<T[]> {
  return withStore({ create: false }, (store) => store.records<T>(entity));
}

/**
 * One record by ID. A record a full sync has marked deleted is still
 * returned, with a warning, because keeping it is the point of the database.
 * A record that was never synced is an error that names `db:sync`.
 */
export async function readLocalRecord<T>(
  entity: string,
  id: number | string,
  label: string,
): Promise<T> {
  const found = await withStore({ create: false }, (store) =>
    store.record<T>(entity, String(id)),
  );
  if (!found) {
    throw new Error(
      `${label} ${id} is not in the local database. Run \`sevdesk db:sync\` or drop --local.`,
    );
  }
  if (found.deletedAt) {
    consola.warn(
      `${label} ${id} was deleted in sevdesk; showing the copy from before ${found.deletedAt}.`,
    );
  }
  return found.data;
}

export interface LocalListOptions<T> {
  /** Stands in for the filters the API applies server-side. */
  where?: (record: T) => boolean;
  /** Stands in for the live command's client-side `keep` filter. */
  keep?: (record: T) => boolean;
  sort?: (a: T, b: T) => number;
  limit?: number | undefined;
  offset?: number | undefined;
}

/**
 * Filters, sorts and pages records the way the live command does: the API
 * filters first and applies `offset`, then `fetchAll` applies `keep` and
 * counts `limit` after it.
 */
export function localList<T>(records: T[], options: LocalListOptions<T>): T[] {
  const all = () => true;
  const sorted = options.sort ? [...records].sort(options.sort) : records;
  const kept = sorted
    .filter(options.where ?? all)
    .slice(options.offset ?? 0)
    .filter(options.keep ?? all);
  return options.limit === undefined ? kept : kept.slice(0, options.limit);
}

interface Identified {
  id: string;
}

/**
 * The order of `GET /AccountingContact`: by contact ID, records without a
 * contact first, ties by ID.
 */
export function byContactThenId(
  a: Identified & { contact?: { id: string } | null },
  b: Identified & { contact?: { id: string } | null },
): number {
  return (
    Number(a.contact?.id ?? 0) - Number(b.contact?.id ?? 0) ||
    Number(a.id) - Number(b.id)
  );
}

/** The API's default order for most lists: newest ID first. */
export function byIdDesc(a: Identified, b: Identified): number {
  return Number(b.id) - Number(a.id);
}

export function byIdAsc(a: Identified, b: Identified): number {
  return Number(a.id) - Number(b.id);
}

/** Plain code-unit text order, as the API sorts text columns. */
export function compareText(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const x = a ?? '';
  const y = b ?? '';
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Newest `field` first, ties broken by newest ID so the order is stable. */
export function byDateDesc<T extends Identified>(
  field: (record: T) => string | null | undefined,
): (a: T, b: T) => number {
  return (a, b) => {
    const difference = time(field(b)) - time(field(a));
    return difference !== 0 ? difference : byIdDesc(a, b);
  };
}

function time(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/** Case-insensitive substring match; an absent needle matches everything. */
export function contains(
  haystack: string | null | undefined,
  needle: string | undefined,
): boolean {
  return (
    needle === undefined ||
    (haystack ?? '').toLowerCase().includes(needle.toLowerCase())
  );
}

/** Whether a reference points at `id`; an absent `id` matches everything. */
export function refersTo(
  ref: { id: string } | null | undefined,
  id: number | undefined,
): boolean {
  return id === undefined || ref?.id === String(id);
}

/**
 * The API's `contact[id]` filter: the document's contact is the given one,
 * or a person belonging to that organization (`contact.parent`). Needs the
 * contact embedded, as `db:sync` stores it.
 */
export function refersToContact(
  ref: { id: string; parent?: { id: string } | null } | null | undefined,
  id: number | undefined,
): boolean {
  return (
    id === undefined || ref?.id === String(id) || ref?.parent?.id === String(id)
  );
}

/** Whether a scalar equals the filter; an absent filter matches everything. */
export function equals(
  value: string | number | null | undefined,
  wanted: string | number | undefined,
): boolean {
  return wanted === undefined || String(value ?? '') === String(wanted);
}

/**
 * {@link equals}, ignoring case: `GET /Invoice?invoiceNumber=re-1065` and
 * `GET /Order?orderNumber=…` match the stored number whatever its case, but
 * only as a whole (verified live).
 */
export function equalsIgnoringCase(
  value: string | null | undefined,
  wanted: string | undefined,
): boolean {
  return (
    wanted === undefined || (value ?? '').toLowerCase() === wanted.toLowerCase()
  );
}

/**
 * A document-date bound as the list commands take it: `dd.mm.yyyy` or a plain
 * `YYYY-MM-DD` compares calendar days in the record's own time zone; Unix
 * seconds or an ISO timestamp compare instants.
 */
type DateBound = { day: string } | { instant: number };

const GERMAN_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateBound(value: string): DateBound {
  const trimmed = value.trim();
  const german = GERMAN_DATE.exec(trimmed);
  if (german) {
    const [, day, month, year] = german;
    return {
      day: `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`,
    };
  }
  if (PLAIN_DATE.test(trimmed)) {
    return { day: trimmed };
  }
  const moment = parseMoment(trimmed);
  if (!moment) {
    throw new Error(
      `Cannot read the date "${value}". Use dd.mm.yyyy, YYYY-MM-DD, Unix seconds or an ISO 8601 timestamp.`,
    );
  }
  return { instant: moment.getTime() };
}

/**
 * Whether a record date lies within the bounds. Both are inclusive, except
 * that `endExclusive` makes an instant `end` exclusive, as `GET /Voucher`
 * treats it. A calendar-day `end` always includes that whole day.
 */
export function inDateRange(
  value: string | null | undefined,
  start: string | undefined,
  end: string | undefined,
  options: { endExclusive?: boolean } = {},
): boolean {
  if (start === undefined && end === undefined) {
    return true;
  }
  if (!value) {
    return false;
  }
  return (
    (start === undefined ||
      compareToBound(value, parseDateBound(start)) >= 0) &&
    (end === undefined || beforeEnd(value, parseDateBound(end), options))
  );
}

function beforeEnd(
  value: string,
  bound: DateBound,
  options: { endExclusive?: boolean },
): boolean {
  const comparison = compareToBound(value, bound);
  return options.endExclusive && 'instant' in bound
    ? comparison < 0
    : comparison <= 0;
}

function compareToBound(value: string, bound: DateBound): number {
  if ('day' in bound) {
    const day = value.slice(0, 10);
    return day < bound.day ? -1 : day > bound.day ? 1 : 0;
  }
  return Date.parse(value) - bound.instant;
}

/** The inclusive `--created-*` / `--updated-*` filters, applied locally. */
export function matchesChangeFilters(
  record: { create?: string | null; update?: string | null },
  filters: ChangeFilterArguments,
): boolean {
  const within = (
    value: string | null | undefined,
    after: string | undefined,
    before: string | undefined,
  ) => {
    if (after === undefined && before === undefined) {
      return true;
    }
    const time = value ? Date.parse(value) : Number.NaN;
    if (Number.isNaN(time)) {
      return false;
    }
    const lower = after === undefined ? undefined : parseMoment(after);
    const upper = before === undefined ? undefined : parseMoment(before);
    // The API compares whole seconds.
    const seconds = Math.floor(time / 1000);
    return (
      (lower === undefined || seconds >= Math.floor(lower.getTime() / 1000)) &&
      (upper === undefined || seconds <= Math.floor(upper.getTime() / 1000))
    );
  };
  return (
    within(record.create, filters.createdAfter, filters.createdBefore) &&
    within(record.update, filters.updatedAfter, filters.updatedBefore)
  );
}

/**
 * Reduces an embedded reference to the `{ id, objectName }` the API returns
 * without `embed`, for commands whose live request does not embed it.
 */
export function collapseRef(ref: ModelRefResponse): ModelRefResponse;
export function collapseRef(
  ref: ModelRefResponse | null | undefined,
): ModelRefResponse | null | undefined;
export function collapseRef(
  ref: ModelRefResponse | null | undefined,
): ModelRefResponse | null | undefined {
  return ref ? { id: ref.id, objectName: ref.objectName } : ref;
}
