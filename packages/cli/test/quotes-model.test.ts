import { describe, expect, it } from 'vitest';
import {
  deliverySchema,
  emptyQuote,
  html,
  positionSchema,
  preview,
  quoteDraftSchema,
  quoteReadySchema,
  totals,
} from '../src/quotes/model';

import { quoteFixture } from './quotes-fixtures';
describe('quote document model', () => {
  it('normalizes a blank quote number to automatic numbering', () => {
    const q = quoteFixture();
    q.document.number = '  ';
    expect(quoteDraftSchema.parse(q).document.number).toBeUndefined();
    expect(
      preview(quoteDraftSchema.parse(q)).issues.some(
        (issue) => issue.path === 'document.number',
      ),
    ).toBe(true);
  });
  it('round-trips incomplete customerless drafts', () => {
    const q = emptyQuote();
    expect(quoteDraftSchema.parse(JSON.parse(JSON.stringify(q)))).toEqual(q);
    expect(preview(q).readyToSave).toBe(false);
    expect(preview(q).issues.some((v) => v.path === 'customer')).toBe(true);
  });
  it('requires an explicit price mode and tax rule before saving', () => {
    const q = quoteFixture();
    delete q.document.priceMode;
    delete q.tax.ruleId;
    const result = quoteReadySchema.safeParse(q);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((v) => v.path.join('.'))).toEqual(
        expect.arrayContaining(['document.priceMode', 'tax.ruleId']),
      );
  });
  it('accepts a complete quote', () =>
    expect(quoteReadySchema.parse(quoteFixture()).document.number).toBe(
      'AN-TEST',
    ));
  it.each([
    { schemaVersion: 2 },
    { customer: { id: 1, number: 'C-TEST' } },
    { customer: { name: 'Guess me' } },
    { status: 200 },
    { id: 42 },
    { total: '100.00' },
    { document: { date: '2024-02-30' } },
    { document: { currency: 'XYZ' } },
    { document: { currency: 'JPY' } },
    { document: { priceMode: 'guess' } },
  ])('rejects invalid file fields %j', (override) =>
    expect(() =>
      quoteDraftSchema.parse({ ...quoteFixture(), ...override }),
    ).toThrow(),
  );
  it('rejects expiry before date', () => {
    const q = quoteFixture();
    q.document.validUntil = '2024-01-01';
    expect(() => quoteReadySchema.parse(q)).toThrow();
  });
  it.each(['-1', 'NaN', 'Infinity', '1,50', '1e3', '€10'])(
    'rejects invalid decimal %s',
    (unitPrice) => {
      expect(() =>
        positionSchema.parse({ ...quoteFixture().positions[0], unitPrice }),
      ).toThrow();
    },
  );
  it('rejects zero quantities, excessive percentages and unknown position fields', () => {
    for (const changes of [
      { quantity: '0' },
      { vatRate: '101' },
      { discount: '101' },
      { id: 9 },
    ])
      expect(() =>
        positionSchema.parse({ ...quoteFixture().positions[0], ...changes }),
      ).toThrow();
  });
  it('uses decimal arithmetic for totals', () => {
    const q = quoteFixture();
    q.positions[0]!.quantity = '3';
    q.positions[0]!.unitPrice = '0.10';
    expect(totals(q)).toMatchObject({
      net: '0.30',
      vat: '0.06',
      gross: '0.36',
    });
  });
  it('handles gross prices and percentage discounts', () => {
    const q = quoteFixture();
    q.document.priceMode = 'gross';
    q.positions[0]!.unitPrice = '119.00';
    q.positions[0]!.discount = '10';
    expect(totals(q)).toMatchObject({
      net: '180.00',
      vat: '34.20',
      gross: '214.20',
    });
  });
  it('shows optional positions separately, without counting them in indicative totals', () => {
    const q = quoteFixture();
    q.positions.push({ ...q.positions[0]!, optional: true });
    expect(totals(q)).toMatchObject({ gross: '238.00', indicative: true });
    expect(totals(q).positions[1]).toMatchObject({
      optional: true,
      gross: '238.00',
    });
  });
  it('rejects VAT for the small entrepreneur scheme', () => {
    const q = quoteFixture();
    q.document.smallSettlement = true;
    expect(() => quoteReadySchema.parse(q)).toThrow();
  });
  it('treats plain text as text, not API HTML', () =>
    expect(html('<a>&"\'\n')).toBe('&lt;a&gt;&amp;&quot;&#39;<br>'));
  it('validates email addresses, CC/BCC and subject headers', () => {
    expect(() =>
      deliverySchema.parse({ ...quoteFixture().delivery, to: 'bad' }),
    ).toThrow();
    expect(() =>
      deliverySchema.parse({
        ...quoteFixture().delivery,
        subject: 'Hi\r\nBcc: x@example.com',
      }),
    ).toThrow();
    expect(() =>
      deliverySchema.parse({ ...quoteFixture().delivery, bcc: ['bad'] }),
    ).toThrow();
  });
});
