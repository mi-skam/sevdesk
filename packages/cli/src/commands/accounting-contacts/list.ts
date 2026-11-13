import type { AccountingContact } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import {
  byContactThenId,
  localList,
  localOption,
  readLocal,
  refersTo,
} from '../../local';
import { printJson, printTable } from '../../output';
import { fetchAll } from '../../pagination';

export default defineCommand({
  description:
    'List accounting contacts: the debitor and creditor numbers of contacts.',
  options: defineOptions(
    z.object({
      contact: z.coerce
        .number()
        .optional()
        .describe('Only the accounting contact of this contact ID.'),
      limit: z.coerce
        .number()
        .optional()
        .describe(
          'Maximum number of accounting contacts to return. Defaults to all of them.',
        ),
      offset: z.coerce
        .number()
        .optional()
        .describe('Number of accounting contacts to skip.'),
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    let accountingContacts: AccountingContact[];
    if (options.local) {
      accountingContacts = localList(
        await readLocal<AccountingContact>('accounting-contacts'),
        {
          where: (record) => refersTo(record.contact, options.contact),
          sort: byContactThenId,
          limit: options.limit,
          offset: options.offset,
        },
      );
    } else {
      const client = await requireClient();
      accountingContacts = await fetchAll(
        (page) =>
          client.accountingContacts.list({
            contactId: options.contact,
            ...page,
          }),
        { limit: options.limit, offset: options.offset },
      );
    }
    if (options.json) {
      printJson(accountingContacts);
      return;
    }
    if (accountingContacts.length === 0) {
      consola.info('No accounting contacts found.');
      return;
    }
    printTable(
      accountingContacts.map((record) => ({
        id: record.id,
        contact: record.contact?.id ?? record.contactName ?? '-',
        debitor: record.debitorNumber ?? '-',
        creditor: record.creditorNumber ?? '-',
      })),
    );
  },
});
