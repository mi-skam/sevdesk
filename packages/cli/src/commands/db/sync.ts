import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { printJson, printTable } from '../../output';
import { withStore } from '../../store';
import { syncStore } from '../../sync';

export default defineCommand({
  description:
    'Copy every record of the account into the local database. Contacts, invoices, orders and vouchers are fetched incrementally after the first run; everything else, and those four once a week, is fetched in full. Records deleted in sevdesk are kept and marked deleted.',
  options: defineOptions(
    z.object({
      full: z
        .boolean()
        .default(false)
        .describe(
          'Fetch every entity in full, which also detects deletions of incrementally synced ones.',
        ),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    const client = await requireClient();
    const { result, path } = await withStore(
      { create: true },
      async (store) => ({
        result: await syncStore(client, store, { full: options.full }),
        path: store.path,
      }),
    );
    if (options.json) {
      printJson({ path, ...result });
      return;
    }
    printTable(
      result.entities.map((entity) => ({
        entity: entity.entity,
        mode: entity.mode,
        fetched: String(entity.fetched),
        new: String(entity.inserted),
        changed: String(entity.updated),
        deleted: String(entity.deleted),
      })),
    );
    for (const entity of result.skipped) {
      consola.info(`Skipped ${entity}: the API token may not read it.`);
    }
    consola.success(`Synced with ${result.requests} requests.`);
    consola.info(`Database: ${path}`);
  },
});
