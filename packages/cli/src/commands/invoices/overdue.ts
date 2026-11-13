import type { Invoice, InvoiceStatus } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import { localOption, readLocal, refersToContact } from '../../local';
import { contactLabel, printJson, printTable } from '../../output';
import { fetchAll } from '../../pagination';

/** Invoices that still expect money: open and partially paid. */
const UNPAID: readonly InvoiceStatus[] = [200, 750];

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const GERMAN_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

/** Today in German time, where sevdesk keeps document dates. */
export function todayInGermany(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
  }).format(now);
}

/** `YYYY-MM-DD` or `dd.mm.yyyy` as `YYYY-MM-DD`; throws on anything else. */
export function parseDay(value: string): string {
  const trimmed = value.trim();
  const german = GERMAN_DATE.exec(trimmed);
  const day = german
    ? `${german[3]}-${german[2]!.padStart(2, '0')}-${german[1]!.padStart(2, '0')}`
    : trimmed;
  const parts = PLAIN_DATE.exec(day);
  const date = parts ? new Date(`${day}T00:00:00Z`) : undefined;
  if (!date || date.toISOString().slice(0, 10) !== day) {
    throw new Error(
      `Cannot read the date "${value}". Use YYYY-MM-DD or dd.mm.yyyy.`,
    );
  }
  return day;
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

export interface OverdueInvoice {
  id: string;
  invoiceNumber: string | null;
  contact: Invoice['contact'];
  invoiceDate: string;
  /** `invoiceDate` plus `timeToPay` days. */
  dueDate: string;
  daysOverdue: number;
  status: string;
  sumGross: string;
  paidAmount: string;
  /** `sumGross` minus `paidAmount`. */
  openAmount: string;
}

/**
 * The unpaid invoices whose due date lies before `on`, most overdue first.
 * `invoiceDate` carries the German offset, so its date part is the
 * document's own calendar day.
 */
export function overdueInvoices(
  invoices: readonly Invoice[],
  on: string,
): OverdueInvoice[] {
  return invoices
    .map((invoice) => {
      const invoiceDate = invoice.invoiceDate.slice(0, 10);
      const dueDate = addDays(invoiceDate, Number(invoice.timeToPay ?? 0) || 0);
      const paid = new Decimal(invoice.paidAmount ?? 0);
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        contact: invoice.contact,
        invoiceDate,
        dueDate,
        daysOverdue: daysBetween(dueDate, on),
        status: invoice.status,
        sumGross: invoice.sumGross,
        paidAmount: paid.toString(),
        openAmount: new Decimal(invoice.sumGross).minus(paid).toString(),
      };
    })
    .filter((invoice) => invoice.daysOverdue > 0)
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) || Number(a.id) - Number(b.id),
    );
}

export default defineCommand({
  description:
    'List open and partially paid invoices past their due date (invoice date plus payment term), most overdue first, with the amount still open.',
  options: defineOptions(
    z.object({
      date: z
        .string()
        .optional()
        .describe(
          'The day to check against, as YYYY-MM-DD or dd.mm.yyyy. Defaults to today in German time.',
        ),
      contact: z.coerce
        .number()
        .optional()
        .describe('ID of the contact whose invoices to check.'),
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    const on =
      options.date === undefined ? todayInGermany() : parseDay(options.date);
    let invoices: Invoice[];
    if (options.local) {
      // Like invoices:list: without showAll the API hides reminders and recurring invoices.
      invoices = (await readLocal<Invoice>('invoices')).filter(
        (invoice) =>
          invoice.invoiceType !== 'MA' &&
          invoice.invoiceType !== 'WKR' &&
          UNPAID.map(String).includes(invoice.status) &&
          refersToContact(invoice.contact, options.contact),
      );
    } else {
      const client = await requireClient();
      invoices = [];
      for (const status of UNPAID) {
        invoices.push(
          ...(await fetchAll(
            (page) =>
              client.invoices.list({
                status,
                contactId: options.contact,
                embed: ['contact'],
                ...page,
              }),
            { keep: (invoice) => invoice.status === String(status) },
          )),
        );
      }
    }
    const overdue = overdueInvoices(invoices, on);
    if (options.json) {
      printJson(overdue);
      return;
    }
    if (overdue.length === 0) {
      consola.info(`No overdue invoices on ${on}.`);
      return;
    }
    printTable(
      overdue.map((invoice) => ({
        id: invoice.id,
        number: invoice.invoiceNumber ?? '',
        contact: contactLabel(invoice.contact),
        due: invoice.dueDate,
        days: String(invoice.daysOverdue),
        open: invoice.openAmount,
      })),
    );
    const total = overdue.reduce(
      (sum, invoice) => sum.plus(invoice.openAmount),
      new Decimal(0),
    );
    consola.info(
      `${overdue.length} overdue ${overdue.length === 1 ? 'invoice' : 'invoices'}, ${total.toString()} open.`,
    );
  },
});
