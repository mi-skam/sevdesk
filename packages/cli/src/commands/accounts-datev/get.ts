import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { printJson } from '../../output';

export default defineCommand({
  description:
    'Show a single booking account (AccountDatev), including hidden accounts that accounts-datev:list does not return. Backed by an undocumented sevdesk endpoint that may change without notice.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The booking account ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const client = await requireClient();
    const accountDatevId = await requireIdArgument({
      value: targetId,
      requirement: 'a booking account as a positional argument',
      question: 'Enter the booking account ID:',
    });
    const account = await client.accountsDatev.get({ accountDatevId });
    if (options.json) {
      printJson(account);
      return;
    }
    consola.info(`ID: ${account.id}`);
    consola.info(`Number: ${account.number ?? '-'}`);
    consola.info(`Name: ${account.name ?? '-'}`);
    consola.info(`Tax rate: ${account.taxRate ?? '-'}`);
    consola.info(`Deprecated: ${account.deprecated ?? '-'}`);
    consola.info(`Hidden: ${account.hidden ?? '-'}`);
    consola.info(`Deactivated: ${account.deactivated ?? '-'}`);
  },
});
