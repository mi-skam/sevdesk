import { describe, expect, it } from 'vitest';

import { describeChanges } from '../src/history';

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
