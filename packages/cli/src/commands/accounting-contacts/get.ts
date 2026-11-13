import type { AccountingContact } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { localOption, readLocalRecord } from '../../local';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Show a single accounting contact.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The accounting contact ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const accountingContactId = await requireIdArgument({
      value: targetId,
      requirement: 'an accounting contact ID as a positional argument',
      question: 'Enter the accounting contact ID:',
    });
    const accountingContact = options.local
      ? await readLocalRecord<AccountingContact>(
          'accounting-contacts',
          accountingContactId,
          'Accounting contact',
        )
      : await (
          await requireClient()
        ).accountingContacts.get({ accountingContactId });
    if (options.json) {
      printJson(accountingContact);
      return;
    }
    consola.info(`ID: ${accountingContact.id}`);
    consola.info(
      `Contact: ${accountingContact.contact?.id ?? accountingContact.contactName ?? '-'}`,
    );
    consola.info(`Debitor number: ${accountingContact.debitorNumber ?? '-'}`);
    consola.info(`Creditor number: ${accountingContact.creditorNumber ?? '-'}`);
  },
});
