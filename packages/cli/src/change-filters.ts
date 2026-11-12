import type { ChangeFilterOptions } from '@mi-skam/sevdesk-sdk';
import { z } from 'zod';

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UNIX_SECONDS = /^\d+$/;

/**
 * Parses a moment given on the command line: Unix seconds, a plain date
 * (`YYYY-MM-DD`, midnight UTC) or an ISO 8601 timestamp.
 */
export function parseMoment(value: string): Date | undefined {
  const trimmed = value.trim();
  if (UNIX_SECONDS.test(trimmed)) {
    return new Date(Number(trimmed) * 1000);
  }
  if (PLAIN_DATE.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (!trimmed.includes('T')) {
    return undefined;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const moment = (description: string) =>
  z
    .string()
    .optional()
    .refine(
      (value) => value === undefined || parseMoment(value) !== undefined,
      {
        message:
          'Expected Unix seconds, a date (YYYY-MM-DD) or an ISO 8601 timestamp.',
      },
    )
    .describe(
      `${description} Unix seconds, a date (YYYY-MM-DD, midnight UTC) or an ISO 8601 timestamp.`,
    );

/**
 * Options of the list commands whose endpoint filters on when a record was
 * created or last changed (`vouchers`, `invoices`, `orders`, `contacts`).
 */
export function changeFilterOptions(noun: string) {
  return {
    createdAfter: moment(`Only ${noun} created at or after this moment.`),
    createdBefore: moment(`Only ${noun} created at or before this moment.`),
    updatedAfter: moment(`Only ${noun} last changed at or after this moment.`),
    updatedBefore: moment(
      `Only ${noun} last changed at or before this moment.`,
    ),
  };
}

export interface ChangeFilterArguments {
  createdAfter?: string | undefined;
  createdBefore?: string | undefined;
  updatedAfter?: string | undefined;
  updatedBefore?: string | undefined;
}

/** Maps the parsed command-line options to the SDK's change filters. */
export function changeFilters(
  options: ChangeFilterArguments,
): ChangeFilterOptions {
  const toDate = (value: string | undefined) =>
    value === undefined ? undefined : parseMoment(value);
  return {
    createAfter: toDate(options.createdAfter),
    createBefore: toDate(options.createdBefore),
    updateAfter: toDate(options.updatedAfter),
    updateBefore: toDate(options.updatedBefore),
  };
}
