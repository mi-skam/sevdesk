import type { ContactCustomField } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import {
  byIdDesc,
  localList,
  localOption,
  readLocal,
  refersTo,
} from '../../local';
import { printJson, printTable } from '../../output';
import { fetchAll } from '../../pagination';

export default defineCommand({
  description: 'List the custom field values of contacts.',
  options: defineOptions(
    z.object({
      contact: z.coerce
        .number()
        .optional()
        .describe('Only the fields of this contact ID.'),
      limit: z.coerce
        .number()
        .optional()
        .describe(
          'Maximum number of field values to return. Defaults to all of them.',
        ),
      offset: z.coerce
        .number()
        .optional()
        .describe('Number of field values to skip.'),
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    let fields: ContactCustomField[];
    if (options.local) {
      fields = localList(
        await readLocal<ContactCustomField>('contact-fields'),
        {
          where: (field) => refersTo(field.contact, options.contact),
          sort: byIdDesc,
          limit: options.limit,
          offset: options.offset,
        },
      );
    } else {
      const client = await requireClient();
      fields = await fetchAll(
        (page) =>
          client.contactCustomFields.list({
            contactId: options.contact,
            ...page,
          }),
        { limit: options.limit, offset: options.offset },
      );
    }
    if (options.json) {
      printJson(fields);
      return;
    }
    if (fields.length === 0) {
      consola.info('No contact fields found.');
      return;
    }
    printTable(
      fields.map((field) => ({
        id: field.id,
        contact: field.contact.id,
        setting: settingLabel(field),
        value: field.value,
      })),
    );
  },
});

function settingLabel(field: ContactCustomField): string {
  const setting = field.contactCustomFieldSetting;
  return 'name' in setting ? setting.name : setting.id;
}
