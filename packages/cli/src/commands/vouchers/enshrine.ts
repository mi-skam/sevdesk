import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { confirmOrAbort } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Enshrine a voucher so that it can no longer be changed.',
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
      message: `Enshrine voucher ${voucherId}? This cannot be undone.`,
      yes: options.yes,
      initial: false,
    });
    if (!confirmed) {
      return;
    }
    await client.vouchers.enshrine({ voucherId });
    if (options.json) {
      printJson({ enshrined: true });
      return;
    }
    consola.success(`Enshrined voucher ${voucherId}.`);
  },
});
