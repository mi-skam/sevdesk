import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { isInteractive } from '../../interactive';
import { assertNumberAvailable } from '../../numbering';
import { printJson } from '../../output';
import { newQuote } from '../../quotes/defaults';
import { quoteDialogue, quoteSummary } from '../../quotes/dialogue';
import {
  deliverySchema,
  preview,
  quoteAutoNumberSchema,
} from '../../quotes/model';
import {
  createQuote,
  loadQuote,
  numberQuote,
  operationSucceeded,
  resolveQuote,
} from '../../quotes/service';

export default defineCommand({
  description: 'Create, review, edit and explicitly send a quote (Angebot).',
  args: z.tuple([
    z
      .string()
      .optional()
      .describe(
        'Optional quote.json; omitted starts a new quote with date and subject defaults (Neues Angebot mit vorbelegtem Datum und Betreff).',
      ),
  ]),
  options: defineOptions(
    z.object({
      interactive: z
        .boolean()
        .default(false)
        .describe(
          'Review and edit a file in the dialogue (Dialog). Requires a terminal.',
        ),
      dryRun: z
        .boolean()
        .default(false)
        .describe(
          'Offline preview (Vorschau); no authentication or network calls.',
        ),
      check: z
        .boolean()
        .default(false)
        .describe(
          'Read-only customer/address and duplicate-number checks; no writes.',
        ),
      send: z
        .boolean()
        .default(false)
        .describe(
          'Save and send (Speichern und versenden), using the delivery section.',
        ),
      receipt: z
        .string()
        .optional()
        .describe(
          'New operation receipt path (Vorgangsprotokoll); never overwritten initially.',
        ),
      json: z
        .boolean()
        .default(false)
        .describe('Machine-readable output (JSON-Ausgabe).'),
    }),
  ),
  action: async (o, [file]) => {
    const machine = o.dryRun || o.check || o.send || o.json;
    const dialogue = o.interactive || (!machine && isInteractive());
    if (o.dryRun && o.check)
      throw new Error('Choose --dry-run or --check, not both.');
    if (dialogue && machine)
      throw new Error(
        'Dialogue mode does not accept --dry-run, --check, --send or --json. Omit --interactive for structured mode.',
      );
    if ((dialogue || (!file && !machine)) && !isInteractive())
      throw new Error(
        'A terminal is required for the dialogue (Dialog). Use quotes:create [quote.json] --dry-run --json, or quotes:create quote.json --json [--send].',
      );
    let q = file ? await loadQuote(file) : newQuote();
    let send = o.send;
    let api: Awaited<ReturnType<typeof requireClient>> | undefined;
    const client = async () => (api ??= await requireClient());
    if (dialogue) {
      const result = await quoteDialogue(client, file ? q : undefined);
      if (!result) return;
      q = result.quote;
      send = result.send;
    }
    if (o.dryRun) {
      const local = preview(q);
      const email = deliverySchema.safeParse(q.delivery);
      const result = {
        dryRun: true,
        ...local,
        numbering: {
          mode: q.document.number ? 'explicit' : 'automatic',
          pending: !q.document.number,
          reserved: false,
        },
        readyToResolveNumber:
          !q.document.number && quoteAutoNumberSchema.safeParse(q).success,
        sendRequested: send,
        deliveryReady: email.success,
        deliveryIssues: email.success
          ? []
          : email.error.issues.map((issue) => ({
              path: ['delivery', ...issue.path].join('.'),
              message: issue.message,
            })),
      };
      if (o.json) printJson(result);
      else {
        consola.info(quoteSummary(q));
        consola.info(
          JSON.stringify(
            {
              readyToSave: local.readyToSave,
              issues: local.issues,
              deliveryReady: result.deliveryReady,
            },
            null,
            2,
          ),
        );
      }
      return;
    }
    if (send) deliverySchema.parse(q.delivery);
    quoteAutoNumberSchema.parse(q);
    if (!q.document.number) q = await numberQuote(await client(), q);
    if (o.check) {
      const resolved = await resolveQuote(await client(), q);
      // Read-only check; this does not establish tax correctness or validate all foreign IDs.
      await assertNumberAvailable(
        await client(),
        'quote',
        resolved.payload.order.orderNumber,
      );
      const result = {
        ...preview(q),
        accountValidated: {
          customer: true,
          recipientAddress: true,
          numberAvailable: true,
          otherIds: false,
          taxCorrectness: false,
        },
        customerName: resolved.customer.name,
        recipient: resolved.payload.order.address,
      };
      if (o.json) printJson(result);
      else consola.info(JSON.stringify(result, null, 2));
      return;
    }
    const result = await createQuote(await client(), q, send, o.receipt);
    if (o.json) printJson(result);
    else {
      consola.info(
        `Quote (Angebot): ${result.orderNumber ?? '—'} · ID ${result.orderId ?? '—'} · ${result.state}`,
      );
      if (result.message) consola.info(result.message);
      consola.info(`Operation receipt (Vorgangsprotokoll): ${result.receipt}`);
      if (result.draftFile)
        consola.info(
          `Recovery draft (Wiederherstellungsentwurf): ${result.draftFile}`,
        );
    }
    if (!operationSucceeded(result)) process.exitCode = 1;
  },
});
