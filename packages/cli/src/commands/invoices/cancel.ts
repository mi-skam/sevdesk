import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument } from '../../arguments';
import { requireClient } from '../../client';
import { invoiceSummary } from '../../invoices/workflow';
import { counterNumber, invoicesNumbered } from '../../numbering';
import { confirmOrAbort } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description:
    'Cancel an open, unpaid invoice: sevdesk creates a cancellation invoice (Stornorechnung) for the negative amount and closes the original. Cannot be undone; the cancellation invoice is not sent (use invoices:send).',
  args: z.tuple([idArgument.describe('Invoice ID.')]),
  options: defineOptions(
    z.object({
      yes: z
        .boolean()
        .default(false)
        .describe('Confirm cancelling this invoice.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [invoiceId]) => {
    const client = await requireClient();
    const invoice = await client.invoices.get({
      invoiceId,
      embed: ['contact'],
    });
    if (invoice.invoiceType !== 'RE') {
      throw new Error(
        `Only regular invoices (type RE) can be cancelled; this one has type ${invoice.invoiceType}.`,
      );
    }
    if (invoice.status === '100') {
      throw new Error(
        'This invoice is still a draft; delete it with `sevdesk invoices:delete` instead of cancelling it.',
      );
    }
    if (invoice.status !== '200') {
      throw new Error(
        `Only open, unpaid invoices (status 200) can be cancelled here; this one has status ${invoice.status} (750 partially paid, 1000 paid or already cancelled). Use the sevdesk web app.`,
      );
    }
    // sevdesk numbers the cancellation invoice from its counter, even when a
    // draft with an explicit number already uses that number.
    let number: string | undefined;
    try {
      number = await counterNumber(client);
    } catch {
      consola.warn(
        'Could not read the invoice numbering, so the number the cancellation invoice will get was not checked for duplicates.',
      );
    }
    if (number !== undefined) {
      const taken = await invoicesNumbered(client, number);
      if (taken.length > 0) {
        throw new Error(
          `sevdesk would number the cancellation invoice ${number} from its counter (Nummernkreis), but ${number} is already used by invoice ID ${taken.map((other) => other.id).join(', ')}. Renumber that invoice while it is a draft, or raise the next number in the sevdesk numbering settings, then cancel again.`,
        );
      }
    }
    if (
      !(await confirmOrAbort({
        message: `Cancel ${invoiceSummary(invoice)}? sevdesk creates a cancellation invoice${number ? ` ${number}` : ''} for -${invoice.sumGross} ${invoice.currency}. This cannot be undone.`,
        yes: options.yes,
        initial: false,
      }))
    )
      return;
    const cancellation = await client.invoices.cancel({ invoiceId });
    if (cancellation.invoiceNumber) {
      const duplicates = await invoicesNumbered(
        client,
        cancellation.invoiceNumber,
      );
      if (duplicates.length > 1) {
        consola.warn(
          `Invoice number ${cancellation.invoiceNumber} is now used ${duplicates.length} times (IDs ${duplicates.map((other) => other.id).join(', ')}).`,
        );
      }
    }
    if (options.json) {
      printJson({
        cancelled: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
        },
        cancellation,
      });
    } else {
      consola.success(
        `Cancelled ${invoice.invoiceNumber ?? invoice.id} (ID ${invoice.id}) with cancellation invoice ${cancellation.invoiceNumber ?? '?'} (ID ${cancellation.id}, ${cancellation.sumGross} ${cancellation.currency}). It has not been sent.`,
      );
    }
  },
});
