import type { PrivateTransactionRule } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { byIdDesc, localList, localOption, readLocal } from '../../local';
import { printJson, printTable } from '../../output';
import { fetchAll } from '../../pagination';

export default defineCommand({
  description: 'List the rules that mark bank transactions as private.',
  options: defineOptions(
    z.object({
      limit: z.coerce
        .number()
        .optional()
        .describe(
          'Maximum number of rules to return. Defaults to all of them.',
        ),
      offset: z.coerce.number().optional().describe('Number of rules to skip.'),
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    let rules: PrivateTransactionRule[];
    if (options.local) {
      rules = localList(
        await readLocal<PrivateTransactionRule>('private-transaction-rules'),
        { sort: byIdDesc, limit: options.limit, offset: options.offset },
      );
    } else {
      const client = await requireClient();
      rules = await fetchAll(
        (page) => client.privateTransactionRules.list(page),
        { limit: options.limit, offset: options.offset },
      );
    }
    if (options.json) {
      printJson(rules);
      return;
    }
    if (rules.length === 0) {
      consola.info('No private transaction rules found.');
      return;
    }
    printTable(
      rules.map((rule) => ({
        id: rule.id,
        counterpart: rule.counterpartName ?? '-',
        purpose: rule.paymentPurpose ?? '-',
      })),
    );
  },
});
