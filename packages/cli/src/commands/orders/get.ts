import type { Order } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { localOption, readLocalRecord } from '../../local';
import { contactLabel, printJson } from '../../output';

export default defineCommand({
  description: 'Show a single order.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('ID of the order. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const orderId = await requireIdArgument({
      value: targetId,
      requirement: 'an order ID as a positional argument',
      question: 'Enter the order ID:',
    });
    const order = options.local
      ? await readLocalRecord<Order>('orders', orderId, 'Order')
      : await (
          await requireClient()
        ).orders.get({ orderId, embed: ['contact'] });
    if (options.json) {
      printJson(order);
      return;
    }
    consola.info(`ID: ${order.id}`);
    consola.info(`Number: ${order.orderNumber}`);
    consola.info(`Date: ${order.orderDate}`);
    consola.info(`Status: ${order.status}`);
    consola.info(`Contact: ${contactLabel(order.contact)}`);
    consola.info(`Net: ${order.sumNet}`);
    consola.info(`Tax: ${order.sumTax}`);
    consola.info(`Gross: ${order.sumGross}`);
    consola.info(`Currency: ${order.currency}`);
  },
});
