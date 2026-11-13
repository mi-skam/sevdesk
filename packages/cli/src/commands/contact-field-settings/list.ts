import type { ContactCustomFieldSetting } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { byIdDesc, localList, localOption, readLocal } from '../../local';
import { printJson, printTable } from '../../output';
import { fetchAll } from '../../pagination';

export default defineCommand({
  description: 'List the custom field definitions for contacts.',
  options: defineOptions(
    z.object({
      limit: z.coerce
        .number()
        .optional()
        .describe(
          'Maximum number of definitions to return. Defaults to all of them.',
        ),
      offset: z.coerce
        .number()
        .optional()
        .describe('Number of definitions to skip.'),
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    let settings: ContactCustomFieldSetting[];
    if (options.local) {
      settings = localList(
        await readLocal<ContactCustomFieldSetting>('contact-field-settings'),
        { sort: byIdDesc, limit: options.limit, offset: options.offset },
      );
    } else {
      const client = await requireClient();
      settings = await fetchAll(
        (page) => client.contactCustomFieldSettings.list(page),
        { limit: options.limit, offset: options.offset },
      );
    }
    if (options.json) {
      printJson(settings);
      return;
    }
    if (settings.length === 0) {
      consola.info('No contact field definitions found.');
      return;
    }
    printTable(
      settings.map((setting) => ({
        id: setting.id,
        name: setting.name,
        identifier: setting.identifier,
        description: setting.description ?? '-',
      })),
    );
  },
});
