import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { printJson } from '../../output';
import { deliverySchema } from '../../quotes/model';
import { loadQuote, operationSucceeded, sendQuote } from '../../quotes/service';

export default defineCommand({
  description:
    'Send an existing quote draft (Angebotsentwurf versenden). Never creates another quote.',
  args: z.tuple([
    z
      .string()
      .describe('quote.json containing delivery details (Versandangaben).'),
  ]),
  options: defineOptions(
    z.object({
      id: z.coerce
        .number()
        .int()
        .positive()
        .describe('Existing quote ID (Angebots-ID).'),
      dryRun: z
        .boolean()
        .default(false)
        .describe('Validate email input offline; do not send.'),
      receipt: z
        .string()
        .optional()
        .describe('New operation receipt path (Vorgangsprotokoll).'),
      json: z.boolean().default(false).describe('Machine-readable output.'),
    }),
  ),
  action: async (o, [file]) => {
    const delivery = deliverySchema.parse((await loadQuote(file)).delivery);
    if (o.dryRun) {
      const result = {
        dryRun: true,
        orderId: o.id,
        delivery,
        attachment: 'Quote PDF (Angebots-PDF)',
        accountValidated: false,
      };
      if (o.json) printJson(result);
      else consola.info(JSON.stringify(result, null, 2));
      return;
    }
    const result = await sendQuote(
      await requireClient(),
      o.id,
      delivery,
      o.receipt,
    );
    if (o.json) printJson(result);
    else consola.info(JSON.stringify(result, null, 2));
    if (!operationSucceeded(result)) process.exitCode = 1;
  },
});
