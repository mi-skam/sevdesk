import type { CreditNoteSendType } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { confirmOrAbort } from '../../options';
import { printJson } from '../../output';

const SEND_TYPES = [
  'VPR',
  'VP',
  'VM',
  'VPDF',
] as const satisfies readonly CreditNoteSendType[];

export default defineCommand({
  description:
    'Render a credit note to a PDF file and mark it as sent: by default as printed (VPR). Use credit-notes:pdf to download without marking it.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('ID of the credit note. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      sendType: z
        .enum(SEND_TYPES)
        .default('VPR')
        .describe(
          'How it was sent: VPR printed, VP postal, VM mailed, VPDF downloaded.',
        ),
      output: z
        .string()
        .optional()
        .describe(
          'Path to write the PDF to. Defaults to credit-note-<id>.pdf.',
        ),
      yes: z.boolean().default(false).describe('Skip the confirmation prompt.'),
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
    const confirmed = await confirmOrAbort({
      message: `Mark credit note ${creditNoteId} as sent (${options.sendType})?`,
      yes: options.yes,
      initial: false,
    });
    if (!confirmed) {
      return;
    }
    const rendered = await client.creditNotes.sendByWithRender({
      creditNoteId,
      sendType: options.sendType,
    });
    const path = resolve(options.output ?? `credit-note-${creditNoteId}.pdf`);
    await writeFile(path, Buffer.from(rendered.pdf, 'base64'));
    if (options.json) {
      printJson({ docId: rendered.docId, path });
      return;
    }
    consola.success(`Saved ${path}.`);
  },
});
