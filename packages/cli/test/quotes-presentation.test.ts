import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { emptyQuote, preview, quoteReadySchema } from '../src/quotes/model';
import { quoteError } from '../src/quotes/presentation';
import { quoteFixture } from './quotes-fixtures';

describe('quote domain language in the human interface', () => {
  it('uses business labels for missing fields rather than JSON paths', () => {
    const result = quoteReadySchema.safeParse(emptyQuote());
    if (result.success) throw new Error('Expected an incomplete quote');
    const text = quoteError(result.error);
    for (const label of [
      'Customer (Kunde)',
      'Quote number (Angebotsnummer)',
      'Quote date (Angebotsdatum)',
      'Subject (Betreff)',
      'Currency (Währung)',
      'Net/gross pricing (Netto-/Bruttopreise)',
      'Our contact person (Unser Ansprechpartner)',
      'Tax rule (Steuerregel)',
      'Tax text (Steuertext)',
      'Line items (Positionen)',
    ])
      expect(text).toContain(label);
    expect(text).not.toMatch(
      /document\.|tax\.|contactPersonId|ruleId|received undefined/,
    );
    expect(text).toContain('Bitte vor dem Speichern ergänzen');
  });
  it('preserves precise JSON paths in structured validation', () => {
    const result = preview(emptyQuote());
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        'document.number',
        'document.date',
        'document.contactPersonId',
        'tax.ruleId',
      ]),
    );
  });
  it('uses the actual form field label for invalid decimal input', () => {
    const result = z
      .object({ quantity: z.string().regex(/^\d+$/) })
      .safeParse({ quantity: '-1' });
    if (result.success) throw new Error('Expected invalid quantity');
    const text = quoteError(result.error, { quantity: 'Quantity (Menge)' });
    expect(text).toContain('Quantity (Menge):');
    expect(text).toContain('Dezimalzahl');
    expect(text).not.toContain('quantity:');
  });
  it('identifies invalid line items using one-based numbering and domain labels', () => {
    const q = quoteFixture();
    q.positions[0]!.quantity = '-1';
    q.positions[0]!.unit.id = 0;
    const result = quoteReadySchema.safeParse(q);
    if (result.success) throw new Error('Expected invalid position');
    const text = quoteError(result.error);
    expect(text).toContain('Line item 1 (Position 1) · Quantity (Menge):');
    expect(text).toContain('Line item 1 (Position 1) · Unit (Einheit):');
    expect(text).not.toMatch(/positions\.0|unit\.id/);
  });
  it('explains invalid dates and email addresses without schema jargon', () => {
    const q = quoteFixture();
    q.document.date = '2024-02-30';
    q.delivery.cc = ['not-an-email'];
    const result = quoteReadySchema.safeParse(q);
    if (result.success) throw new Error('Expected invalid date and email');
    const text = quoteError(result.error);
    expect(text).toContain('Quote date (Angebotsdatum): Enter a valid date');
    expect(text).toContain(
      'Copy recipients (Kopieempfänger) 1: Enter a valid email address',
    );
    expect(text).not.toContain('Invalid');
  });
  it('does not leak unexpected schema keys', () => {
    const result = z.strictObject({}).safeParse({ implementationDetail: true });
    if (result.success) throw new Error('Expected unsupported field');
    expect(quoteError(result.error)).toBe(
      'Quote (Angebot): Contains unsupported information (Enthält nicht unterstützte Angaben).',
    );
  });
  it('preserves non-validation failures', () => {
    expect(quoteError(new Error('Account unavailable'))).toBe(
      'Account unavailable',
    );
  });
});
