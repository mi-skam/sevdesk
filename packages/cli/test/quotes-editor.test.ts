import { describe, expect, it } from 'vitest';
import {
  fieldLabel,
  fieldSchema,
  fieldValue,
  oneLine,
  positionLabel,
  quoteFields,
  quoteFieldValue,
} from '../src/quotes/editor';
import { quoteFixture } from './quotes-fixtures';

describe('quote editor presentation and field routing', () => {
  it('routes each visible field to the shared model schema and current value', () => {
    const quote = quoteFixture();
    for (const field of quoteFields) {
      expect(
        fieldSchema(field).safeParse(quoteFieldValue(quote, field)).success,
        field.section + ':' + field.key,
      ).toBe(true);
    }
    expect(
      new Set(quoteFields.map((field) => field.section + ':' + field.key)).size,
    ).toBe(quoteFields.length);
  });
  it('uses shared schema rules rather than a second editor-only model', () => {
    const currency = quoteFields.find((field) => field.key === 'currency')!;
    const date = quoteFields.find((field) => field.key === 'date')!;
    const user = quoteFields.find((field) => field.key === 'contactPersonId')!;
    expect(fieldSchema(currency).safeParse('not-currency').success).toBe(false);
    expect(fieldSchema(date).safeParse('2024-02-30').success).toBe(false);
    expect(fieldSchema(user).safeParse(-1).success).toBe(false);
  });
  it('keeps values and missing markers on their own selectable labels', () => {
    const heading = quoteFields.find((field) => field.key === 'heading')!;
    expect(fieldLabel(heading, 'Example')).toBe('Heading (Betreff)  Example');
    expect(fieldLabel(heading, undefined, true)).toBe('⚠ Heading (Betreff)  —');
  });
  it('distinguishes unset booleans from explicitly selected values', () => {
    const field = {
      key: 'example',
      label: 'Example',
      kind: 'boolean' as const,
    };
    expect(fieldValue(field, undefined)).toBe('—');
    expect(fieldValue(field, false)).toBe('No (Nein)');
    expect(fieldValue(field, true)).toBe('Yes (Ja)');
  });
  it('uses readable price modes and comma-separated arrays', () => {
    const mode = { key: 'mode', label: 'Mode', kind: 'mode' as const };
    expect(fieldValue(mode, 'net')).toBe('Net (Netto)');
    expect(fieldValue(mode, 'gross')).toBe('Gross (Brutto)');
    expect(oneLine(['one@example.com', 'two@example.com'])).toBe(
      'one@example.com, two@example.com',
    );
  });
  it('compacts multiline values and strips terminal control characters', () => {
    expect(oneLine('First\nSecond\tThird')).toBe('First · Second · Third');
    expect(oneLine('A\x1b[2JB\x07\x9b')).toBe('A[2JB');
    expect(oneLine('😀'.repeat(10), 5)).toBe('😀😀😀😀…');
  });
  it('shows name, quantity, unit, price, VAT, discount and optional status on position rows', () => {
    const quote = quoteFixture();
    quote.positions[0]!.discount = '5';
    quote.positions[0]!.optional = true;
    expect(positionLabel(quote, 0)).toBe(
      '1. Consulting  |  2 hours × 100.00 EUR  | VAT (USt) 19% · −5% · optional (optional)',
    );
  });
  it('does not invent a unit label for unresolved account IDs', () => {
    const quote = quoteFixture();
    delete quote.positions[0]!.unit.label;
    expect(positionLabel(quote, 0)).toContain('unit ID 1');
  });
});
