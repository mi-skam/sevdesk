import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { printJson } from '../../output';
import { fetchAll } from '../../pagination';

export default defineCommand({
  description:
    'Inspect a quote (Angebot prüfen), optionally including its positions (Positionen).',
  options: defineOptions(
    z.object({
      id: z.coerce
        .number()
        .int()
        .positive()
        .describe('Quote ID (Angebots-ID).'),
      positions: z
        .boolean()
        .default(false)
        .describe('Include all positions (Positionen).'),
      json: z.boolean().default(false).describe('Machine-readable output.'),
    }),
  ),
  action: async (o) => {
    const client = await requireClient();
    const quote = await client.orders.get({
      orderId: o.id,
      embed: ['contact'],
    });
    if (quote.orderType !== 'AN')
      throw new Error('The selected document is not a quote (Angebot).');
    const result = o.positions
      ? {
          quote,
          positions: await fetchAll((page) =>
            client.orders.listPositions({ orderId: o.id, ...page }),
          ),
        }
      : quote;
    if (o.json) printJson(result);
    else consola.info(JSON.stringify(result, null, 2));
  },
});
