import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { confirmOrAbort } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description:
    'Delete an accounting contact. sevdesk warns this can cause booking errors, especially in the DATEV export.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The accounting contact ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      yes: z.boolean().default(false).describe('Skip the confirmation prompt.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const client = await requireClient();
    const accountingContactId = await requireIdArgument({
      value: targetId,
      requirement: 'an accounting contact ID as a positional argument',
      question: 'Enter the accounting contact ID:',
    });
    const confirmed = await confirmOrAbort({
      message: `Delete accounting contact ${accountingContactId}? This can cause booking errors, especially in the DATEV export.`,
      yes: options.yes,
      initial: false,
    });
    if (!confirmed) {
      return;
    }
    await client.accountingContacts.delete({ accountingContactId });
    if (options.json) {
      printJson({ deleted: true });
      return;
    }
    consola.success('Accounting contact deleted.');
  },
});
