import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { requireStringOption } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Change the value of a custom field.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The contact field ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      value: z
        .string()
        .optional()
        .describe('New value. If omitted, you will be prompted.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const client = await requireClient();
    const contactCustomFieldId = await requireIdArgument({
      value: targetId,
      requirement: 'a contact field ID as a positional argument',
      question: 'Enter the contact field ID:',
    });
    const value = await requireStringOption({
      value: options.value,
      requirement: 'a value via --value',
      question: 'Enter the new value:',
    });
    const field = await client.contactCustomFields.update({
      contactCustomFieldId,
      value,
    });
    if (options.json) {
      printJson(field);
      return;
    }
    consola.success(`Updated contact field ${field.id}.`);
  },
});
