import type { ContactCustomField } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { localOption, readLocalRecord } from '../../local';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Show a single custom field value.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The contact field ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const contactCustomFieldId = await requireIdArgument({
      value: targetId,
      requirement: 'a contact field ID as a positional argument',
      question: 'Enter the contact field ID:',
    });
    const field = options.local
      ? await readLocalRecord<ContactCustomField>(
          'contact-fields',
          contactCustomFieldId,
          'Contact field',
        )
      : await (
          await requireClient()
        ).contactCustomFields.get({ contactCustomFieldId });
    if (options.json) {
      printJson(field);
      return;
    }
    consola.info(`ID: ${field.id}`);
    consola.info(`Contact: ${field.contact.id}`);
    consola.info(`Setting: ${field.contactCustomFieldSetting.id}`);
    consola.info(`Value: ${field.value}`);
  },
});
