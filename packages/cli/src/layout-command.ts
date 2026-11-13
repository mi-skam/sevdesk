import type {
  ChangeLayoutOptions,
  ChangeLayoutResult,
  SevDesk,
} from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from './arguments';
import { requireClient } from './client';
import { printJson } from './output';

interface LayoutCommandOptions {
  /** Lower-case document label, e.g. `invoice`. */
  label: string;
  change: (
    client: SevDesk,
    id: number,
    change: ChangeLayoutOptions,
  ) => Promise<ChangeLayoutResult>;
}

/**
 * `<documents>:layout`: changes template, letterpaper, language or PayPal
 * setting through `changeParameter`, one request per given option.
 */
export function defineLayoutCommand({ label, change }: LayoutCommandOptions) {
  return defineCommand({
    description: `Change the template, letterpaper, language or PayPal setting of ${article(label)}. Find IDs with layouts:templates and layouts:letterpapers.`,
    args: z.tuple([
      idArgument
        .optional()
        .describe(`The ${label} ID. If omitted, you will be prompted.`),
    ]),
    options: defineOptions(
      z.object({
        template: z.string().optional().describe('Template ID.'),
        letterpaper: z.string().optional().describe('Letterpaper ID.'),
        language: z
          .string()
          .optional()
          .describe('Document language, for example de_DE or en_US.'),
        paypal: z.string().optional().describe('PayPal setting value.'),
        json: z.boolean().default(false).describe('Output in JSON format.'),
      }),
    ),
    action: async (options, [targetId]) => {
      const changes: ChangeLayoutOptions[] = [];
      if (options.template !== undefined) {
        changes.push({ key: 'template', value: options.template });
      }
      if (options.letterpaper !== undefined) {
        changes.push({ key: 'letterpaper', value: options.letterpaper });
      }
      if (options.language !== undefined) {
        changes.push({ key: 'language', value: options.language });
      }
      if (options.paypal !== undefined) {
        changes.push({ key: 'payPal', value: options.paypal });
      }
      if (changes.length === 0) {
        consola.error(
          'You must provide at least one of --template, --letterpaper, --language or --paypal.',
        );
        process.exit(1);
      }
      const client = await requireClient();
      const id = await requireIdArgument({
        value: targetId,
        requirement: `${article(label)} ID as a positional argument`,
        question: `Enter the ${label} ID:`,
      });
      const results = [];
      for (const item of changes) {
        const result = await change(client, id, item);
        // The re-rendered PDF is large and available through the pdf command.
        results.push({
          key: item.key,
          value: item.value,
          result: result.result,
          docId: result.metadaten?.docId ?? null,
        });
      }
      if (options.json) {
        printJson(results);
        return;
      }
      consola.success(
        `Changed ${changes.map((item) => item.key).join(', ')} of ${label} ${id}.`,
      );
    },
  });
}

function article(label: string): string {
  return /^[aeiou]/.test(label) ? `an ${label}` : `a ${label}`;
}
