import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { requireStringOption } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Create a custom field definition for contacts.',
  options: defineOptions(
    z.object({
      name: z
        .string()
        .optional()
        .describe('Name of the field. If omitted, you will be prompted.'),
      description: z.string().optional().describe('Description of the field.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    const client = await requireClient();
    const name = await requireStringOption({
      value: options.name,
      requirement: 'a name via --name',
      question: 'Enter the field name:',
    });
    const setting = await client.contactCustomFieldSettings.create({
      name,
      description: options.description,
    });
    if (options.json) {
      printJson(setting);
      return;
    }
    consola.success(`Created contact field definition ${setting.id}.`);
  },
});
