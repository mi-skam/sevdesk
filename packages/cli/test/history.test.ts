import { describe, expect, it } from 'vitest';

import { describeChanges, recordLabel } from '../src/history';

describe('describeChanges', () => {
  it('lists changed fields and leaves out the update timestamp', () => {
    expect(
      describeChanges(
        { id: '1', update: 'a', status: '100', description: 'RE-1' },
        { id: '1', update: 'b', status: '1000', description: 'RE-1' },
      ),
    ).toBe('status: 100 → 1000');
  });

  it('compares nested objects field by field', () => {
    expect(
      describeChanges(
        { contact: { id: '7', name: 'ACME' } },
        { contact: { id: '7', name: 'ACME GmbH' } },
      ),
    ).toBe('contact.name: ACME → ACME GmbH');
  });

  it('shows added and removed fields with a dash', () => {
    expect(describeChanges({ a: '1' }, { b: '2' })).toBe('a: 1 → –; b: – → 2');
    expect(
      describeChanges({ contact: { id: '7' } }, { contactName: 'ACME' }),
    ).toBe('contact: {"id":"7"} → –; contactName: – → ACME');
  });

  it('is empty when only the update timestamp changed', () => {
    expect(describeChanges({ update: 'a' }, { update: 'b' })).toBe('');
  });

  it('shortens long values', () => {
    const text = describeChanges({ note: 'x' }, { note: 'y'.repeat(100) });
    expect(text.length).toBeLessThan(80);
    expect(text.endsWith('…')).toBe(true);
  });
});

describe('recordLabel', () => {
  it('names invoices, transactions, vouchers and contacts', () => {
    expect(
      recordLabel({
        objectName: 'Invoice',
        invoiceNumber: 'RE-1',
        sumGross: '119',
        contact: { id: '7', objectName: 'Contact', name: 'ACME GmbH' },
        header: 'Rechnung Nr. RE-1',
      }),
    ).toBe('RE-1 · 119 · ACME GmbH');
    expect(
      recordLabel({
        objectName: 'CheckAccountTransaction',
        amount: '-18.07',
        payeePayerName: 'ACME Hosting',
        paymtPurpose: 'RE-1',
      }),
    ).toBe('-18.07 · ACME Hosting · RE-1');
    expect(
      recordLabel({
        objectName: 'Voucher',
        description: 'B-1',
        sumGross: '59.5',
        supplierName: 'ACME Coffee',
      }),
    ).toBe('B-1 · 59.5 · ACME Coffee');
    expect(
      recordLabel({
        objectName: 'Contact',
        name: null,
        surename: 'Erika',
        familyname: 'Mustermann',
      }),
    ).toBe('Erika Mustermann');
  });

  it('is empty for records without any of the fields', () => {
    expect(recordLabel({ id: '1', objectName: 'TagRelation' })).toBe('');
    expect(recordLabel(null)).toBe('');
  });

  it('shortens long labels', () => {
    const label = recordLabel({ name: 'x'.repeat(200) });
    expect(label).toHaveLength(80);
    expect(label.endsWith('…')).toBe(true);
  });
});
