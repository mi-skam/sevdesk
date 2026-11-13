import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { requireNumberOption } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Give a contact a debitor and/or creditor number.',
  options: defineOptions(
    z.object({
      contact: z.coerce
        .number()
        .optional()
        .describe('ID of the contact. If omitted, you will be prompted.'),
      debitorNumber: z.coerce
        .number()
        .optional()
        .describe('Debitor number for the contact.'),
      creditorNumber: z.coerce
        .number()
        .optional()
        .describe('Creditor number for the contact.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    const client = await requireClient();
    const contactId = await requireNumberOption({
      value: options.contact,
      requirement: 'a contact ID via --contact',
      question: 'Enter the contact ID:',
    });
    const accountingContact = await client.accountingContacts.create({
      contactId,
      debitorNumber: options.debitorNumber,
      creditorNumber: options.creditorNumber,
    });
    if (options.json) {
      printJson(accountingContact);
      return;
    }
    consola.success(`Created accounting contact ${accountingContact.id}.`);
  },
});
