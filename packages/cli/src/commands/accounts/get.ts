import type { CheckAccount } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { localOption, readLocalRecord } from '../../local';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Show a single check account.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The check account ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const checkAccountId = await requireIdArgument({
      value: targetId,
      requirement: 'a check account ID as a positional argument',
      question: 'Enter the check account ID:',
    });
    const checkAccount = options.local
      ? await readLocalRecord<CheckAccount>(
          'check-accounts',
          checkAccountId,
          'Check account',
        )
      : await (await requireClient()).checkAccounts.get({ checkAccountId });
    if (options.json) {
      printJson(checkAccount);
      return;
    }
    consola.info(`ID: ${checkAccount.id}`);
    consola.info(`Name: ${checkAccount.name}`);
    consola.info(`Type: ${checkAccount.type}`);
    consola.info(`Import type: ${checkAccount.importType ?? '-'}`);
    consola.info(`IBAN: ${checkAccount.iban ?? '-'}`);
    consola.info(`Accounting number: ${checkAccount.accountingNumber ?? '-'}`);
    consola.info(`Currency: ${checkAccount.currency}`);
    consola.info(`Balance: ${checkAccount.balance ?? '-'}`);
    consola.info(`Status: ${checkAccount.status}`);
  },
});
