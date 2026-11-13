import type { TemplateType } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { printJson, printTable } from '../../output';

const TYPES = [
  'Invoice',
  'Invoicereminder',
  'Order',
  'Contractnote',
  'Packinglist',
  'Letter',
  'Creditnote',
] as const satisfies readonly TemplateType[];

export default defineCommand({
  description: 'List the document templates.',
  options: defineOptions(
    z.object({
      type: z
        .enum(TYPES)
        .optional()
        .describe(`Only templates of this type: ${TYPES.join(', ')}.`),
      json: z
        .boolean()
        .default(false)
        .describe('Output in JSON format, including the template HTML.'),
    }),
  ),
  action: async (options) => {
    const client = await requireClient();
    const templates = await client.layouts.listTemplates({
      type: options.type,
    });
    if (options.json) {
      printJson(templates);
      return;
    }
    if (templates.length === 0) {
      consola.info('No templates found.');
      return;
    }
    printTable(
      templates.map((template) => ({
        id: template.id,
        name: template.name,
        type: template.type,
        default: template.default ? 'yes' : '',
      })),
    );
  },
});
