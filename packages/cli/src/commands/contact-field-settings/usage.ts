import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { printJson } from '../../output';

export default defineCommand({
  description:
    'Count the contacts that have a value for a custom field definition.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The definition ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
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
    if (options.json) {
      printJson({ references });
      return;
    }
    consola.info(`Used by ${references} contact field value(s).`);
  },
});
