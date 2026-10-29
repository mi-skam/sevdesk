import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { contactLabel, printJson, servicePeriodLabel } from '../../output';

export default defineCommand({
  description: 'Show a single voucher.',
  args: z.tuple([idArgument.optional().describe('ID of the voucher.')]),
  options: defineOptions(
    z.object({
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const client = await requireClient();
    const voucherId = await requireIdArgument({
      value: targetId,
      requirement: 'a voucher ID as a positional argument',
      question: 'Enter the voucher ID:',
    });
    const voucher = await client.vouchers.get({
      voucherId,
      embed: ['supplier'],
    });
    if (options.json) {
      printJson(voucher);
      return;
    }
    consola.info(`ID: ${voucher.id}`);
    consola.info(`Status: ${voucher.status ?? '-'}`);
    consola.info(`Date: ${voucher.voucherDate ?? '-'}`);
    consola.info(
      `Service period: ${
        servicePeriodLabel(voucher.deliveryDate, voucher.deliveryDateUntil) ||
        '-'
      }`,
    );
    consola.info(
      `Supplier: ${voucher.supplierName ?? contactLabel(voucher.supplier)}`,
    );
    consola.info(`Description: ${voucher.description ?? '-'}`);
    consola.info(`Net: ${voucher.sumNet}`);
    consola.info(`Tax: ${voucher.sumTax}`);
    consola.info(`Gross: ${voucher.sumGross}`);
    consola.info(`Currency: ${voucher.currency ?? '-'}`);
    consola.info(`Enshrined: ${voucher.enshrined ?? 'no'}`);
  },
});
