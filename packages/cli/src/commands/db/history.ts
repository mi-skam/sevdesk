import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { parseMoment } from '../../change-filters';
import { describeChanges, recordLabel } from '../../history';
import { printJson, printTable } from '../../output';
import { withStore } from '../../store';
import { ENTITIES } from '../../sync';

const ENTITY_NAMES = ENTITIES.map((definition) => definition.name) as [
  string,
  ...string[],
];

/** `2026-11-13 17:58` in the local time zone. */
function localMinute(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE').slice(0, 16);
}

/** Longest change summary shown in the table when listing many records. */
const MAX_SUMMARY_LENGTH = 100;

export default defineCommand({
  description:
    'Show the change log of the local database: what each `db:sync` found new, changed, deleted or restored, newest first. The first sync of an entity logs nothing, and changes superseded between two syncs are not seen. Makes no request.',
  args: z.tuple([
    z
      .enum(ENTITY_NAMES)
      .optional()
      .describe(
        'Only changes of this entity, as `db:sync` names it (e.g. vouchers).',
      ),
    z
      .string()
      .regex(/^\d+$/, 'Expected a numeric record ID.')
      .optional()
      .describe('Only changes of this record ID; needs the entity.'),
  ]),
  options: defineOptions(
    z.object({
      since: z
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
          'Only changes recorded at or after this moment. Unix seconds, a date (YYYY-MM-DD, midnight UTC) or an ISO 8601 timestamp.',
        ),
      limit: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Maximum number of changes to show. Defaults to 20, or all of them for one record.',
        ),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [entity, id]) => {
    const since =
      options.since === undefined
        ? undefined
        : parseMoment(options.since)?.toISOString();
    const changes = await withStore({ create: false }, (store) =>
      store.changes({
        entity,
        id,
        since,
        limit: options.limit ?? (id === undefined ? 20 : undefined),
      }),
    );
    const rows = changes.map((change) => ({
      ...change,
      label: recordLabel(change.data ?? change.previous),
      changes:
        change.kind === 'updated' || change.kind === 'restored'
          ? describeChanges(change.previous, change.data)
          : '',
    }));
    if (options.json) {
      printJson(rows);
      return;
    }
    if (rows.length === 0) {
      consola.info(
        'No changes found. The change log starts with the second `sevdesk db:sync` of an entity.',
      );
      return;
    }
    printTable(
      rows.map((row) => ({
        recorded: localMinute(row.recordedAt),
        entity: row.entity,
        id: row.id,
        label: row.label,
        change: row.kind,
        changes:
          id === undefined && row.changes.length > MAX_SUMMARY_LENGTH
            ? `${row.changes.slice(0, MAX_SUMMARY_LENGTH - 1)}…`
            : row.changes,
      })),
    );
  },
});
