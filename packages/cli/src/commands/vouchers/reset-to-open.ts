import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { confirmOrAbort } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Reset a voucher to the open status.',
  args: z.tuple([idArgument.optional().describe('ID of the voucher.')]),
  options: defineOptions(
    z.object({
      yes: z.boolean().default(false).describe('Skip the confirmation prompt.'),
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
    const confirmed = await confirmOrAbort({
      message: `Reset voucher ${voucherId} to open? This unlinks existing payments.`,
      yes: options.yes,
      initial: false,
    });
    if (!confirmed) {
      return;
    }
    const voucher = await client.vouchers.resetToOpen({ voucherId });
    if (options.json) {
      printJson(voucher);
      return;
    }
    consola.success(
      `Reset voucher ${voucher.id}. New status: ${voucher.status ?? '-'}.`,
    );
  },
});
