import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { contactLabel, printJson } from '../../output';

export default defineCommand({
  description: 'Show a single credit note.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('ID of the credit note. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const client = await requireClient();
    const creditNoteId = await requireIdArgument({
      value: targetId,
      requirement: 'a credit note ID as a positional argument',
      question: 'Enter the credit note ID:',
    });
    const creditNote = await client.creditNotes.get({
      creditNoteId,
      embed: ['contact'],
    });
    if (options.json) {
      printJson(creditNote);
      return;
    }
    consola.info(`ID: ${creditNote.id}`);
    consola.info(`Number: ${creditNote.creditNoteNumber ?? '-'}`);
    consola.info(`Date: ${creditNote.creditNoteDate}`);
    consola.info(`Status: ${creditNote.status}`);
    consola.info(`Contact: ${contactLabel(creditNote.contact)}`);
    consola.info(`Net: ${creditNote.sumNet}`);
    consola.info(`Tax: ${creditNote.sumTax}`);
    consola.info(`Gross: ${creditNote.sumGross}`);
    consola.info(`Currency: ${creditNote.currency ?? '-'}`);
  },
});
