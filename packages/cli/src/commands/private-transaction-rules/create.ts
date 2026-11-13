import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { printJson } from '../../output';

export default defineCommand({
  description:
    'Create a rule that marks matching bank transactions as private automatically.',
  options: defineOptions(
    z.object({
      counterpart: z
        .string()
        .optional()
        .describe('Counterpart name of the transactions to match.'),
      purpose: z
        .string()
        .optional()
        .describe('Payment purpose of the transactions to match.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    if (options.counterpart === undefined && options.purpose === undefined) {
      consola.error('You must provide --counterpart, --purpose or both.');
      process.exit(1);
    }
    const client = await requireClient();
    const rule = await client.privateTransactionRules.create({
      counterpartName: options.counterpart,
      paymentPurpose: options.purpose,
    });
    if (options.json) {
      printJson(rule);
      return;
    }
    consola.success(`Created private transaction rule ${rule.id}.`);
  },
});
