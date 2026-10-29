import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Update the service period of a voucher.',
  args: z.tuple([idArgument.optional().describe('ID of the voucher.')]),
  options: defineOptions(
    z.object({
      deliveryDate: z
        .string()
        .optional()
        .describe(
          'Start of the service period, or the single service date, as dd.mm.yyyy or Unix timestamp.',
        ),
      deliveryDateUntil: z
        .string()
        .optional()
        .describe('End of the service period as dd.mm.yyyy or Unix timestamp.'),
      clearDeliveryDateUntil: z
        .boolean()
        .default(false)
        .describe(
          'Remove the end of the service period, leaving a single service date.',
        ),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    if (
      options.clearDeliveryDateUntil &&
      options.deliveryDateUntil !== undefined
    ) {
      consola.error(
        'You cannot use --delivery-date-until together with --clear-delivery-date-until.',
      );
      process.exit(1);
    }
    const client = await requireClient();
    const voucherId = await requireIdArgument({
      value: targetId,
      requirement: 'a voucher ID as a positional argument',
      question: 'Enter the voucher ID:',
    });
    const voucher = await client.vouchers.update({
      voucherId,
      deliveryDate: options.deliveryDate,
      deliveryDateUntil: options.clearDeliveryDateUntil
        ? null
        : options.deliveryDateUntil,
    });
    if (options.json) {
      printJson(voucher);
      return;
    }
    consola.success(`Updated voucher ${voucher.id}.`);
  },
});
