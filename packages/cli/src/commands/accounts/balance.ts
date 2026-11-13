import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Show the balance of a check account at a given date.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The check account ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      date: z
        .string()
        .default(() => new Date().toISOString().slice(0, 10))
        .describe('The date to calculate the balance for (YYYY-MM-DD).'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const client = await requireClient();
    const checkAccountId = await requireIdArgument({
      value: targetId,
      requirement: 'a check account ID as a positional argument',
      question: 'Enter the check account ID:',
    });
    const raw = await client.checkAccounts.getBalanceAtDate({
      checkAccountId,
      date: options.date,
    });
    // The API answers "-0" for an account whose transactions cancel out.
    const balance = /^-0(\.0+)?$/.test(raw) ? raw.slice(1) : raw;
    if (options.json) {
      printJson({ checkAccountId, date: options.date, balance });
      return;
    }
    consola.info(`Balance at ${options.date}: ${balance}`);
  },
});
