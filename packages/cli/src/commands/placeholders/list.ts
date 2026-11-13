import type { PlaceholderObjectName } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { printJson, printTable } from '../../output';

const OBJECT_TYPES = [
  'Invoice',
  'CreditNote',
  'Order',
  'Contact',
  'Letter',
  'Email',
] as const;

export default defineCommand({
  description: 'List the placeholders usable in the texts of a document type.',
  options: defineOptions(
    z.object({
      objectType: z
        .enum(OBJECT_TYPES)
        .describe(
          'Document type: Invoice, CreditNote, Order, Contact, Letter or Email.',
        ),
      subObjectType: z
        .enum(['Invoice', 'CreditNote', 'Order', 'Contact', 'Letter'])
        .optional()
        .describe('For Email: the document type the e-mail is sent with.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    const client = await requireClient();
    const groups = await client.textparser.listPlaceholders({
      objectName: options.objectType satisfies PlaceholderObjectName,
      subObjectName: options.subObjectType,
    });
    if (options.json) {
      printJson(groups);
      return;
    }
    const rows = groups.flatMap((group) =>
      group.value.map((entry) => ({
        group: group.key,
        placeholder: entry.key,
        description: entry.value,
      })),
    );
    if (rows.length === 0) {
      consola.info('No placeholders found.');
      return;
    }
    printTable(rows);
  },
});
