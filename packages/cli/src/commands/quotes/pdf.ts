import { consola } from 'consola';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { printJson } from '../../output';

export default defineCommand({
  description:
    'Download a quote preview (Angebotsvorschau) without marking it sent.',
  options: defineOptions(
    z.object({
      id: z.coerce
        .number()
        .int()
        .positive()
        .describe('Quote ID (Angebots-ID).'),
      output: z
        .string()
        .describe('New PDF output path; existing files are never overwritten.'),
      json: z.boolean().default(false).describe('Machine-readable output.'),
    }),
  ),
  action: async (o) => {
    const client = await requireClient();
    const quote = await client.orders.get({ orderId: o.id });
    if (quote.orderType !== 'AN')
      throw new Error('The selected document is not a quote (Angebot).');
    const pdf = await client.orders.getPdf({
      orderId: o.id,
      preventSendBy: true,
    });
    const path = resolve(o.output);
    await writeFile(path, Buffer.from(pdf.content, 'base64'), {
      flag: 'wx',
      mode: 0o600,
    });
    if (o.json) printJson({ path, filename: pdf.filename });
    else consola.success(`Preview saved (Vorschau gespeichert): ${path}`);
  },
});
