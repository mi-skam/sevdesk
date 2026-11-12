import type { CheckAccountTransaction } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { localOption, readLocalRecord } from '../../local';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Show a single transaction.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The transaction ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const transactionId = await requireIdArgument({
      value: targetId,
      requirement: 'a transaction ID as a positional argument',
      question: 'Enter the transaction ID:',
    });
    const transaction = options.local
      ? await readLocalRecord<CheckAccountTransaction>(
          'transactions',
          transactionId,
          'Transaction',
        )
      : await (await requireClient()).transactions.get({ transactionId });
    if (options.json) {
      printJson(transaction);
      return;
    }
    consola.info(`ID: ${transaction.id}`);
    consola.info(`Value date: ${transaction.valueDate}`);
    consola.info(`Amount: ${transaction.amount}`);
    consola.info(`Payee: ${transaction.payeePayerName ?? '-'}`);
    consola.info(`Purpose: ${transaction.paymtPurpose ?? '-'}`);
    consola.info(`Status: ${transaction.status}`);
    consola.info(`Check account: ${transaction.checkAccount.id}`);
  },
});
