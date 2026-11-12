import type { CheckAccount } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { byIdAsc, localList, localOption, readLocal } from '../../local';
import { printJson, printTable } from '../../output';
import { fetchAll } from '../../pagination';

export default defineCommand({
  description: 'List your check accounts.',
  options: defineOptions(
    z.object({
      limit: z.coerce
        .number()
        .optional()
        .describe(
          'The maximum number of check accounts to return. Defaults to all of them.',
        ),
      offset: z.coerce
        .number()
        .optional()
        .describe('The number of check accounts to skip.'),
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    let checkAccounts: CheckAccount[];
    if (options.local) {
      checkAccounts = localList(
        await readLocal<CheckAccount>('check-accounts'),
        {
          // The API lists the default account first, then by ascending ID.
          sort: (a, b) =>
            Number(b.defaultAccount ?? 0) - Number(a.defaultAccount ?? 0) ||
            byIdAsc(a, b),
          limit: options.limit,
          offset: options.offset,
        },
      );
    } else {
      const client = await requireClient();
      checkAccounts = await fetchAll(
        (page) => client.checkAccounts.list(page),
        { limit: options.limit, offset: options.offset },
      );
    }
    if (options.json) {
      printJson(checkAccounts);
      return;
    }
    if (checkAccounts.length === 0) {
      consola.info('No check accounts found.');
      return;
    }
    printTable(
      checkAccounts.map((checkAccount) => ({
        id: checkAccount.id,
        name: checkAccount.name,
        type: checkAccount.type,
        importType: checkAccount.importType ?? '',
        accountingNumber: checkAccount.accountingNumber ?? '',
        currency: checkAccount.currency,
        status: checkAccount.status,
      })),
    );
  },
});
