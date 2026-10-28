import { consola } from 'consola';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { assertNumberAvailable, nextNumber } from '../../numbering';
import { confirmOrAbort } from '../../options';
import { printJson } from '../../output';

const id = z.number().int().positive();
const text = z.string().trim().min(1);
// Accept calendar dates only; serialize explicitly for the SDK's voucher-date API.
const date = z.iso
  .date()
  .transform((value) => value.split('-').reverse().join('.'));

export const invoiceCreateSchema = z
  .strictObject({
    invoice: z.strictObject({
      status: z.literal(100).default(100),
      invoiceType: z.literal('RE').default('RE'),
      invoiceNumber: z.preprocess(
        (value) =>
          typeof value === 'string' && !value.trim() ? undefined : value,
        text.optional(),
      ),
      contactId: id,
      contactPersonId: id,
      invoiceDate: date,
      currency: z.string().regex(/^[A-Z]{3}$/),
      taxRuleId: id,
      taxText: text,
      showNet: z.boolean(),
      timeToPay: z.number().int().nonnegative(),
      deliveryDate: date,
      deliveryDateUntil: date.optional(),
      header: text.optional(),
      headText: z.string().optional(),
      footText: z.string().optional(),
      customerInternalNote: z.string().optional(),
      smallSettlement: z.boolean().optional(),
      paymentMethodId: id.optional(),
    }),
    positions: z
      .array(
        z.strictObject({
          name: text,
          quantity: z.number().positive(),
          price: z.number().nonnegative(),
          taxRate: z.number().min(0).max(100),
          unityId: id,
          text: z.string().optional(),
          discount: z.number().min(0).max(100).optional(),
        }),
      )
      .min(1),
  })
  .superRefine(({ invoice }, ctx) => {
    const iso = (value: string) => value.split('.').reverse().join('-');
    if (iso(invoice.deliveryDate) > iso(invoice.invoiceDate)) {
      ctx.addIssue({
        code: 'custom',
        path: ['invoice', 'deliveryDate'],
        message:
          'A regular invoice cannot have a service date after its invoice date.',
      });
    }
    if (
      invoice.deliveryDateUntil &&
      (iso(invoice.deliveryDateUntil) < iso(invoice.deliveryDate) ||
        iso(invoice.deliveryDateUntil) > iso(invoice.invoiceDate))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['invoice', 'deliveryDateUntil'],
        message:
          'Service period end must be between service start and invoice date.',
      });
    }
  });

export default defineCommand({
  description:
    'Create a regular draft invoice from a validated JSON file. Never sends or finalizes it.',
  options: defineOptions(
    z.object({
      file: z
        .string()
        .min(1)
        .describe(
          'JSON file containing invoice and positions. Dates use YYYY-MM-DD.',
        ),
      dryRun: z
        .boolean()
        .default(false)
        .describe(
          'Validate and print the normalized payload without authentication or API calls.',
        ),
      yes: z
        .boolean()
        .default(false)
        .describe('Confirm creation of the draft invoice.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    const input = invoiceCreateSchema.parse(
      JSON.parse(await readFile(options.file, 'utf8')),
    );
    const payload = {
      ...input,
      positions: input.positions.map((position, positionNumber) => ({
        ...position,
        positionNumber,
      })),
      takeDefaultAddress: true,
    };
    if (options.dryRun) {
      printJson({
        dryRun: true,
        payload,
        numbering: {
          mode: input.invoice.invoiceNumber ? 'explicit' : 'automatic',
          pending: !input.invoice.invoiceNumber,
          reserved: false,
        },
      });
      return;
    }
    if (
      !(await confirmOrAbort({
        message: `Create a draft invoice for contact ${input.invoice.contactId} with ${input.positions.length} position(s)?`,
        yes: options.yes,
        initial: false,
      }))
    )
      return;
    const client = await requireClient();
    const invoiceNumber =
      input.invoice.invoiceNumber ??
      (await nextNumber(client, 'invoice')).nextNumber;
    await assertNumberAvailable(client, 'invoice', invoiceNumber);
    const result = await client.invoices.save({
      ...payload,
      invoice: {
        ...payload.invoice,
        invoiceNumber,
        header: payload.invoice.header ?? `Rechnung Nr. ${invoiceNumber}`,
      },
    });
    if (options.json) {
      printJson(result);
      return;
    }
    consola.success(
      `Created draft invoice ${result.invoice.invoiceNumber ?? result.invoice.id} (ID ${result.invoice.id}). Not sent or finalized.`,
    );
  },
});
