import type { ContactCustomFieldSetting } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { localOption, readLocalRecord } from '../../local';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Show a single custom field definition.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The definition ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const contactCustomFieldSettingId = await requireIdArgument({
      value: targetId,
      requirement: 'a definition ID as a positional argument',
      question: 'Enter the definition ID:',
    });
    const setting = options.local
      ? await readLocalRecord<ContactCustomFieldSetting>(
          'contact-field-settings',
          contactCustomFieldSettingId,
          'Contact field definition',
        )
      : await (
          await requireClient()
        ).contactCustomFieldSettings.get({ contactCustomFieldSettingId });
    if (options.json) {
      printJson(setting);
      return;
    }
    consola.info(`ID: ${setting.id}`);
    consola.info(`Name: ${setting.name}`);
    consola.info(`Identifier: ${setting.identifier}`);
    consola.info(`Description: ${setting.description ?? '-'}`);
  },
});
