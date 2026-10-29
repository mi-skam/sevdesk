import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument } from '../../arguments';
import { requireClient } from '../../client';
import { printJson } from '../../output';
import { fetchAll } from '../../pagination';

export default defineCommand({
  description:
    'Inspect a quote (Angebot prüfen), optionally including its positions (Positionen).',
  args: z.tuple([idArgument.describe('Quote ID (Angebots-ID).')]),
  options: defineOptions(
    z.object({
      positions: z
        .boolean()
        .default(false)
        .describe('Include all positions (Positionen).'),
      json: z.boolean().default(false).describe('Machine-readable output.'),
    }),
  ),
  action: async (o, [id]) => {
    const client = await requireClient();
    const quote = await client.orders.get({
      orderId: id,
      embed: ['contact'],
    });
    if (quote.orderType !== 'AN')
      throw new Error('The selected document is not a quote (Angebot).');
    const result = o.positions
      ? {
          quote,
          positions: await fetchAll((page) =>
            client.orders.listPositions({ orderId: id, ...page }),
          ),
        }
      : quote;
    if (o.json) printJson(result);
    else consola.info(JSON.stringify(result, null, 2));
  },
});
