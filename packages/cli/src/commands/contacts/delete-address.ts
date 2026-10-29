import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { confirmOrAbort } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Delete an address of a contact.',
  args: z.tuple([
    idArgument
      .optional()
      .describe(
        'The contact address ID, as shown by contacts:get. If omitted, you will be prompted.',
      ),
  ]),
  options: defineOptions(
    z.object({
      yes: z.boolean().default(false).describe('Skip the confirmation prompt.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const client = await requireClient();
    const contactAddressId = await requireIdArgument({
      value: targetId,
      requirement: 'a contact address ID as a positional argument',
      question: 'Enter the contact address ID:',
    });
    const confirmed = await confirmOrAbort({
      message: `Delete contact address ${contactAddressId}?`,
      yes: options.yes,
      initial: false,
    });
    if (!confirmed) {
      return;
    }
    await client.contactAddresses.delete({ contactAddressId });
    if (options.json) {
      printJson({ deleted: true });
      return;
    }
    consola.success('Contact address deleted.');
  },
});
