import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Rename or describe a custom field definition.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The definition ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      name: z.string().optional().describe('New name.'),
      description: z.string().optional().describe('New description.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    if (options.name === undefined && options.description === undefined) {
      consola.error('You must provide --name, --description or both.');
      process.exit(1);
    }
    const client = await requireClient();
    const contactCustomFieldSettingId = await requireIdArgument({
      value: targetId,
      requirement: 'a definition ID as a positional argument',
      question: 'Enter the definition ID:',
    });
    const setting = await client.contactCustomFieldSettings.update({
      contactCustomFieldSettingId,
      name: options.name,
      description: options.description,
    });
    if (options.json) {
      printJson(setting);
      return;
    }
    consola.success(`Updated contact field definition ${setting.id}.`);
  },
});
