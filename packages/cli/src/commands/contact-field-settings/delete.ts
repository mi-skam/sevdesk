import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { confirmOrAbort } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Delete a custom field definition.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The definition ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      yes: z.boolean().default(false).describe('Skip the confirmation prompt.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const client = await requireClient();
    const contactCustomFieldSettingId = await requireIdArgument({
      value: targetId,
      requirement: 'a definition ID as a positional argument',
      question: 'Enter the definition ID:',
    });
    const references = await client.contactCustomFieldSettings.referenceCount({
      contactCustomFieldSettingId,
    });
    const confirmed = await confirmOrAbort({
      message: `Delete contact field definition ${contactCustomFieldSettingId}? ${references} contact field value(s) use it.`,
      yes: options.yes,
      initial: false,
    });
    if (!confirmed) {
      return;
    }
    await client.contactCustomFieldSettings.delete({
      contactCustomFieldSettingId,
    });
    if (options.json) {
      printJson({ deleted: true });
      return;
    }
    consola.success('Contact field definition deleted.');
  },
});
