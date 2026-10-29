import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { nextNumber } from '../../numbering';
import { printJson } from '../../output';

export default defineCommand({
  description:
    'Read invoice or quote numbering (Nummernkreis). Does not reserve or consume a number.',
  options: defineOptions(
    z.object({
      kind: z
        .enum(['invoice', 'quote'])
        .default('invoice')
        .describe('invoice (Rechnung) or quote (Angebot).'),
      suggest: z
        .boolean()
        .optional()
        .describe(
          'Suggest the next unused number (Nächste freie Nummer vorschlagen), including existing drafts; does not reserve it.',
        ),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    const client = await requireClient();
    if (options.suggest) {
      const suggestion = await nextNumber(client, options.kind);
      if (options.json) printJson(suggestion);
      else
        consola.info(
          [
            options.kind === 'invoice'
              ? 'Invoice numbering (Rechnungsnummernkreis)'
              : 'Quote numbering (Angebotsnummernkreis)',
            `Format (Nummernformat): ${suggestion.format}`,
            `Highest existing number (Höchste vorhandene Nummer): ${suggestion.highestExistingNumber ?? '—'}`,
            `Next number (Nächste Nummer): ${suggestion.nextNumber}`,
            'Not reserved; checked again before saving (Nicht reserviert; vor dem Speichern erneut geprüft).',
          ].join('\n'),
        );
      return;
    }
    const sequence = await client.basics.getNumberSequence(
      options.kind === 'invoice'
        ? { objectType: 'Invoice', type: 'RE' }
        : { objectType: 'Order', type: 'AN' },
    );
    if (
      !sequence ||
      typeof sequence.format !== 'string' ||
      typeof sequence.nextSequence !== 'string' ||
      sequence.forObject !==
        (options.kind === 'invoice' ? 'Invoice' : 'Order') ||
      sequence.type !== (options.kind === 'invoice' ? 'RE' : 'AN')
    )
      throw new Error(
        'No usable numbering configuration found (Kein nutzbarer Nummernkreis gefunden).',
      );
    if (options.json) printJson(sequence);
    else
      consola.info(
        [
          options.kind === 'invoice'
            ? 'Invoice numbering (Rechnungsnummernkreis)'
            : 'Quote numbering (Angebotsnummernkreis)',
          `Format (Nummernformat): ${sequence.format}`,
          `Configured counter (Eingestellter Zähler): ${sequence.nextSequence}`,
          'Read only, no number reserved (Nur gelesen, keine Nummer reserviert).',
          'Existing drafts may already use this counter; check existing numbers before saving (Entwürfe können diesen Zähler bereits verwenden; vorhandene Nummern vor dem Speichern prüfen).',
        ].join('\n'),
      );
  },
});
