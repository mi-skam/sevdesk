import type { Order, OrderPosition } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument } from '../../arguments';
import { requireClient } from '../../client';
import {
  byIdAsc,
  localList,
  localOption,
  readLocal,
  readLocalRecord,
  refersTo,
} from '../../local';
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
      ...localOption,
      json: z.boolean().default(false).describe('Machine-readable output.'),
    }),
  ),
  action: async (o, [id]) => {
    const client = o.local ? undefined : await requireClient();
    const quote = client
      ? await client.orders.get({ orderId: id, embed: ['contact'] })
      : await readLocalRecord<Order>('orders', id, 'Quote');
    if (quote.orderType !== 'AN')
      throw new Error('The selected document is not a quote (Angebot).');
    const result = o.positions
      ? {
          quote,
          positions: client
            ? await fetchAll((page) =>
                client.orders.listPositions({ orderId: id, ...page }),
              )
            : localList(await readLocal<OrderPosition>('order-positions'), {
                where: (position) => refersTo(position.order, id),
                sort: byIdAsc,
              }),
        }
      : quote;
    if (o.json) printJson(result);
    else consola.info(JSON.stringify(result, null, 2));
  },
});
