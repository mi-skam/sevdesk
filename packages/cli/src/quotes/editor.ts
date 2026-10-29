import type { z } from 'zod';
import { quoteDraftSchema, type QuoteDraft } from './model';

export interface Field {
  key: string;
  label: string;
  kind?: 'boolean' | 'number' | 'mode' | 'array' | 'multiline';
  optional?: boolean;
}
export type Section = 'document' | 'tax' | 'texts' | 'terms';
export interface QuoteField extends Field {
  section: Section;
}
export const quoteFields: QuoteField[] = [
  {
    section: 'document',
    key: 'number',
    label: 'Quote number (Angebotsnummer)',
    optional: true,
  },
  {
    section: 'document',
    key: 'date',
    label: 'Quote date YYYY-MM-DD (Angebotsdatum)',
    optional: true,
  },
  {
    section: 'document',
    key: 'validUntil',
    label: 'Valid until YYYY-MM-DD (Gültig bis)',
    optional: true,
  },
  {
    section: 'document',
    key: 'heading',
    label: 'Heading (Betreff)',
    optional: true,
  },
  {
    section: 'document',
    key: 'currency',
    label: 'Currency (Währung)',
    optional: true,
  },
  {
    section: 'document',
    key: 'priceMode',
    label: 'Price mode (Preisart)',
    kind: 'mode',
  },
  {
    section: 'texts',
    key: 'introduction',
    label: 'Introduction (Einleitung)',
    kind: 'multiline',
    optional: true,
  },
  {
    section: 'texts',
    key: 'closing',
    label: 'Closing (Schlusstext)',
    kind: 'multiline',
    optional: true,
  },
  {
    section: 'terms',
    key: 'payment',
    label: 'Payment terms (Zahlungsbedingungen)',
    kind: 'multiline',
    optional: true,
  },
  {
    section: 'terms',
    key: 'delivery',
    label: 'Delivery terms (Lieferbedingungen)',
    kind: 'multiline',
    optional: true,
  },
  {
    section: 'tax',
    key: 'text',
    label: 'Tax text (Steuertext)',
    optional: true,
  },
  {
    section: 'tax',
    key: 'ruleId',
    label: 'Tax rule (Steuerregel-ID)',
    kind: 'number',
    optional: true,
  },
  {
    section: 'document',
    key: 'contactPersonId',
    label: 'Our contact person (Unser Ansprechpartner, Benutzer-ID)',
    kind: 'number',
    optional: true,
  },
  {
    section: 'document',
    key: 'customerReference',
    label: 'Customer reference (Kundenreferenz)',
    optional: true,
  },
  {
    section: 'document',
    key: 'smallSettlement',
    label: 'Small entrepreneur scheme (Kleinunternehmerregelung)',
    kind: 'boolean',
  },
];

/** A one-line value preview never permits imported text to control the terminal. */
export function oneLine(value: unknown, max = 72): string {
  const text = (Array.isArray(value) ? value.join(', ') : String(value ?? ''))
    .replace(/[\r\n\t]+/g, ' · ')
    // Strip terminal control characters from imported field previews.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .trim();
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : text;
}
export function fieldValue(field: Field, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (field.kind === 'boolean')
    return value === true ? 'Yes (Ja)' : 'No (Nein)';
  if (field.kind === 'mode')
    return value === 'net' ? 'Net (Netto)' : 'Gross (Brutto)';
  return oneLine(value);
}
export function fieldLabel(
  field: Field,
  value: unknown,
  missing = false,
): string {
  return (missing ? '⚠ ' : '') + field.label + '  ' + fieldValue(field, value);
}
export function quoteFieldValue(quote: QuoteDraft, field: QuoteField): unknown {
  return (quote[field.section] as Record<string, unknown>)[field.key];
}
export function fieldSchema(field: QuoteField): z.ZodType {
  const section = quoteDraftSchema.shape[field.section].removeDefault();
  return (section.shape as Record<string, z.ZodType>)[field.key]!;
}
export function positionLabel(quote: QuoteDraft, index: number): string {
  const position = quote.positions[index]!;
  const unit = position.unit.label ?? 'unit ID ' + position.unit.id;
  return (
    index +
    1 +
    '. ' +
    oneLine(position.name, 42) +
    '  |  ' +
    position.quantity +
    ' ' +
    oneLine(unit, 16) +
    ' × ' +
    position.unitPrice +
    ' ' +
    (quote.document.currency ?? '') +
    '  | VAT (USt) ' +
    position.vatRate +
    '%' +
    (position.discount && Number(position.discount)
      ? ' · −' + position.discount + '%'
      : '') +
    (position.optional ? ' · optional (optional)' : '')
  );
}
