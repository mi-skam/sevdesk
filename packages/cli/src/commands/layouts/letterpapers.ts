import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { printJson, printTable } from '../../output';

export default defineCommand({
  description: 'List the letterpapers.',
  options: defineOptions(
    z.object({
      json: z
        .boolean()
        .default(false)
        .describe('Output in JSON format, including the thumbnails.'),
    }),
  ),
  action: async (options) => {
    const client = await requireClient();
    const letterpapers = await client.layouts.listLetterpapers();
    if (options.json) {
      printJson(letterpapers);
      return;
    }
    if (letterpapers.length === 0) {
      consola.info('No letterpapers found.');
      return;
    }
    printTable(
      letterpapers.map((letterpaper) => ({
        id: letterpaper.id,
        name: letterpaper.name,
        default: letterpaper.default ? 'yes' : '',
      })),
    );
  },
});
