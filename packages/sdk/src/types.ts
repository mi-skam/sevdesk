/**
 * Accepted date representations for request options. Numbers are interpreted
 * as Unix timestamps in seconds, strings are passed through unchanged.
 */
export type DateInput = Date | string | number;

export interface ListOptions {
  limit?: number;
  offset?: number;
}

/**
 * Filters on when a record was created or last changed. Only `GET /Voucher`,
 * `GET /Invoice`, `GET /Order` and `GET /Contact` accept them; the API
 * describes them in its prose documentation, not as declared parameters.
 * Dates are sent as Unix timestamps in seconds. Despite their names the
 * bounds are inclusive: a record whose `update` equals `updateAfter` is
 * returned (verified live on all four endpoints).
 */
export interface ChangeFilterOptions {
  /** Only records created at or after this moment. */
  createAfter?: DateInput;
  /** Only records created at or before this moment. */
  createBefore?: DateInput;
  /** Only records last changed at or after this moment. */
  updateAfter?: DateInput;
  /** Only records last changed at or before this moment. */
  updateBefore?: DateInput;
}

/** Reference to a related object in request bodies. */
export interface ModelRef {
  id: number;
  objectName: string;
}

/**
 * Reference to a related object in responses. The sevdesk API returns all
 * scalar values in responses as strings, including ids.
 */
export interface ModelRefResponse {
  id: string;
  objectName: string;
}
