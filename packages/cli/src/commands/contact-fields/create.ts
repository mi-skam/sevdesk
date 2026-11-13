import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { requireNumberOption, requireStringOption } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Set a custom field of a contact.',
  options: defineOptions(
    z.object({
      contact: z.coerce
        .number()
        .optional()
        .describe('ID of the contact. If omitted, you will be prompted.'),
      setting: z.coerce
        .number()
        .optional()
        .describe(
          'ID of the field definition, see contact-field-settings:list. If omitted, you will be prompted.',
        ),
      value: z
        .string()
        .optional()
        .describe('Value of the field. If omitted, you will be prompted.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    const client = await requireClient();
    const contactId = await requireNumberOption({
      value: options.contact,
      requirement: 'a contact ID via --contact',
      question: 'Enter the contact ID:',
    });
    const settingId = await requireNumberOption({
      value: options.setting,
      requirement: 'a field definition ID via --setting',
      question: 'Enter the field definition ID:',
    });
    const value = await requireStringOption({
      value: options.value,
      requirement: 'a value via --value',
      question: 'Enter the value:',
    });
    const field = await client.contactCustomFields.create({
      contactId,
      settingId,
      value,
    });
    if (options.json) {
      printJson(field);
      return;
    }
    consola.success(`Created contact field ${field.id}.`);
  },
});
