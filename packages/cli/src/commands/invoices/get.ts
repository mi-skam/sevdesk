import type { Invoice, InvoicePosition } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { fetchInvoicePositions } from '../../invoices/positions';
import {
  byIdAsc,
  localList,
  localOption,
  readLocal,
  readLocalRecord,
  refersTo,
} from '../../local';
import { contactLabel, printJson } from '../../output';

export default defineCommand({
  description: 'Show a single invoice.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('ID of the invoice. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      positions: z
        .boolean()
        .optional()
        .describe('Include all line items in the output.'),
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const client = options.local ? undefined : await requireClient();
    const invoiceId = await requireIdArgument({
      value: targetId,
      requirement: 'an invoice ID as a positional argument',
      question: 'Enter the invoice ID:',
    });
    const invoice = client
      ? await client.invoices.get({ invoiceId, embed: ['contact'] })
      : await readLocalRecord<Invoice>('invoices', invoiceId, 'Invoice');
    let positions: InvoicePosition[] | undefined;
    if (options.positions) {
      positions = client
        ? await fetchInvoicePositions(client, invoiceId)
        : localList(await readLocal<InvoicePosition>('invoice-positions'), {
            where: (position) => refersTo(position.invoice, invoiceId),
            sort: byIdAsc,
          });
    }
    if (options.json) {
      printJson(positions ? { invoice, positions } : invoice);
      return;
    }
    consola.info(`ID: ${invoice.id}`);
    consola.info(`Number: ${invoice.invoiceNumber ?? '-'}`);
    consola.info(`Date: ${invoice.invoiceDate}`);
    consola.info(`Status: ${invoice.status}`);
    consola.info(`Contact: ${contactLabel(invoice.contact)}`);
    consola.info(`Net: ${invoice.sumNet}`);
    consola.info(`Tax: ${invoice.sumTax}`);
    consola.info(`Gross: ${invoice.sumGross}`);
    consola.info(`Currency: ${invoice.currency}`);
    if (positions) printJson(positions);
  },
});
