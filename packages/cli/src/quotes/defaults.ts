import { emptyQuote } from './model';

/** Calendar date in the operator's local timezone, not the previous/next UTC day. */
export function quoteDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Safe local defaults only; tax, currency and account-specific IDs are never inferred from history. */
export function newQuote(now = new Date()) {
  const quote = emptyQuote();
  quote.document.date = quoteDate(now);
  quote.document.heading = 'Angebot';
  return quote;
}
