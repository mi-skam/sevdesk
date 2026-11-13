import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { confirmOrAbort } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description:
    'Change the debitor or creditor number of an accounting contact. sevdesk warns this can cause booking errors, especially in the DATEV export.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The accounting contact ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      debitorNumber: z.coerce
        .number()
        .optional()
        .describe('New debitor number.'),
      creditorNumber: z.coerce
        .number()
        .optional()
        .describe('New creditor number.'),
      yes: z.boolean().default(false).describe('Skip the confirmation prompt.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    if (
      options.debitorNumber === undefined &&
      options.creditorNumber === undefined
    ) {
      consola.error(
        'You must provide at least one of --debitor-number or --creditor-number.',
      );
      process.exit(1);
    }
    const client = await requireClient();
    const accountingContactId = await requireIdArgument({
      value: targetId,
      requirement: 'an accounting contact ID as a positional argument',
      question: 'Enter the accounting contact ID:',
    });
    const confirmed = await confirmOrAbort({
      message: `Change accounting contact ${accountingContactId}? This can cause booking errors, especially in the DATEV export.`,
      yes: options.yes,
      initial: false,
    });
    if (!confirmed) {
      return;
    }
    const accountingContact = await client.accountingContacts.update({
      accountingContactId,
      debitorNumber: options.debitorNumber,
      creditorNumber: options.creditorNumber,
    });
    if (options.json) {
      printJson(accountingContact);
      return;
    }
    consola.success(`Updated accounting contact ${accountingContact.id}.`);
  },
});
