import type { Part } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { localOption, readLocalRecord } from '../../local';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Show a single part.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The part ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const partId = await requireIdArgument({
      value: targetId,
      requirement: 'a part ID as a positional argument',
      question: 'Enter the part ID:',
    });
    const part = options.local
      ? await readLocalRecord<Part>('parts', partId, 'Part')
      : await (await requireClient()).parts.get({ partId });
    if (options.json) {
      printJson(part);
      return;
    }
    consola.info(`ID: ${part.id}`);
    consola.info(`Part number: ${part.partNumber}`);
    consola.info(`Name: ${part.name}`);
    consola.info(`Text: ${part.text ?? '-'}`);
    consola.info(`Price: ${part.price ?? '-'}`);
    consola.info(`Price net: ${part.priceNet ?? '-'}`);
    consola.info(`Price gross: ${part.priceGross ?? '-'}`);
    consola.info(`Tax rate: ${part.taxRate}`);
    consola.info(`Stock: ${part.stock}`);
    consola.info(`Status: ${part.status ?? '-'}`);
  },
});
