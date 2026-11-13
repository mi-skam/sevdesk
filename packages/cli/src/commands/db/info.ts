import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { printJson, printTable } from '../../output';
import { withStore } from '../../store';

export default defineCommand({
  description:
    'Show where the local database is, how many records it holds per entity and when each was last synced.',
  options: defineOptions(
    z.object({
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    const info = await withStore({ create: false }, (store) => store.info());
    if (options.json) {
      printJson(info);
      return;
    }
    consola.info(`Database: ${info.path} (${formatBytes(info.bytes)})`);
    consola.info(`Last sync: ${info.lastSync ?? 'never'}`);
    consola.info(
      `Change log: ${info.changes} ${info.changes === 1 ? 'entry' : 'entries'} (see \`sevdesk db:history\`)`,
    );
    if (info.entities.length === 0) {
      consola.info('No records synced yet.');
      return;
    }
    printTable(
      info.entities.map((entity) => ({
        entity: entity.entity,
        records: String(entity.records),
        deleted: String(entity.deleted),
        lastSync: entity.lastSync ?? '',
        lastFullSync: entity.lastFullSync ?? '',
      })),
    );
  },
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KiB', 'MiB', 'GiB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
