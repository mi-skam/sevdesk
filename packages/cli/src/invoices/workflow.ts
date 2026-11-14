import type { Invoice } from '@mi-skam/sevdesk-sdk';
import { contactLabel } from '../output';

export function requireDraft(invoice: Invoice) {
  if (invoice.sendDate || invoice.status !== '100' || invoice.enshrined) {
    throw new Error(
      'Only unsent draft invoices can be changed or deleted. Finalised invoices are immutable (GoBD); use a credit note or cancellation instead.',
    );
  }
}

/**
 * What `invoices:send` may email: an unsent draft, or a cancellation invoice
 * (`SR`) that has not been mailed yet. A cancellation invoice is created
 * finalised (status `1000`) and inherits the original's `sendType`; mailing
 * it sets `sendType` to `VM` but leaves `sendDate` empty (verified live), so
 * `VM` is what marks it as sent.
 */
export function requireSendable(invoice: Invoice) {
  const sendable =
    invoice.invoiceType === 'SR'
      ? !invoice.sendDate && invoice.sendType !== 'VM'
      : !invoice.sendDate && invoice.status === '100' && !invoice.enshrined;
  if (!sendable) {
    throw new Error(
      'Invoice is already sent or is not an editable draft; automatic resend is refused.',
    );
  }
}

export function invoiceSummary(invoice: Invoice) {
  return `${invoice.invoiceNumber ?? invoice.id} (ID ${invoice.id}), contact ${contactLabel(invoice.contact) || invoice.contact?.id || 'not set'}, gross ${invoice.sumGross} ${invoice.currency}`;
}
