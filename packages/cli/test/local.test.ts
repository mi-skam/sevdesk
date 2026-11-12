import { describe, expect, it } from 'vitest';
import {
  byDateDesc,
  byIdDesc,
  collapseRef,
  compareText,
  contains,
  equals,
  inDateRange,
  localList,
  matchesChangeFilters,
  parseDateBound,
  refersTo,
  refersToContact,
} from '../src/local';

const rows = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: String(n),
  even: n % 2 === 0,
}));

describe('localList', () => {
  it('filters, then skips the offset, then keeps, then limits', () => {
    const result = localList(rows, {
      where: (row) => row.id !== '1',
      offset: 1,
      keep: (row) => row.even,
      limit: 1,
    });
    // where: 2..6, offset 1: 3..6, keep: 4, 6, limit 1: 4
    expect(result.map((row) => row.id)).toEqual(['4']);
  });

  it('sorts without changing the input', () => {
    const result = localList(rows, { sort: byIdDesc });
    expect(result.map((row) => row.id)).toEqual(['6', '5', '4', '3', '2', '1']);
    expect(rows[0]?.id).toBe('1');
  });
});

describe('byDateDesc', () => {
  it('orders newest first and breaks ties by newest ID', () => {
    const records = [
      { id: '1', date: '2026-01-01T00:00:00+01:00' },
      { id: '3', date: '2026-01-01T00:00:00+01:00' },
      { id: '2', date: '2026-02-01T00:00:00+01:00' },
      { id: '4', date: null },
    ];
    expect(
      [...records].sort(byDateDesc((r) => r.date)).map((r) => r.id),
    ).toEqual(['2', '3', '1', '4']);
  });
});

describe('matchers', () => {
  it('contains ignores case and matches everything without a needle', () => {
    expect(contains('ACME GmbH', 'acme')).toBe(true);
    expect(contains(null, 'acme')).toBe(false);
    expect(contains(null, undefined)).toBe(true);
  });

  it('equals compares as text', () => {
    expect(equals('1000', 1000)).toBe(true);
    expect(equals('100', 1000)).toBe(false);
    expect(equals(null, undefined)).toBe(true);
  });

  it('refersTo matches a reference by ID', () => {
    expect(refersTo({ id: '7' }, 7)).toBe(true);
    expect(refersTo({ id: '7' }, 8)).toBe(false);
    expect(refersTo(null, 7)).toBe(false);
    expect(refersTo(null, undefined)).toBe(true);
  });

  it('refersToContact also matches persons of an organization', () => {
    const person = { id: '9', parent: { id: '7' } };
    expect(refersToContact(person, 7)).toBe(true);
    expect(refersToContact(person, 9)).toBe(true);
    expect(refersToContact(person, 8)).toBe(false);
    expect(refersToContact({ id: '7', parent: null }, 7)).toBe(true);
  });

  it('compareText sorts numbers as text', () => {
    expect(['140', '1371', '135'].sort(compareText)).toEqual([
      '135',
      '1371',
      '140',
    ]);
  });

  it('collapseRef keeps only id and objectName', () => {
    expect(
      collapseRef({ id: '7', objectName: 'Contact', name: 'ACME' } as never),
    ).toEqual({ id: '7', objectName: 'Contact' });
    expect(collapseRef(null)).toBeNull();
  });
});

describe('parseDateBound', () => {
  it('reads calendar days', () => {
    expect(parseDateBound('1.3.2026')).toEqual({ day: '2026-03-01' });
    expect(parseDateBound('2026-03-01')).toEqual({ day: '2026-03-01' });
  });

  it('reads instants', () => {
    expect(parseDateBound('1772319600')).toEqual({
      instant: 1772319600 * 1000,
    });
    expect(parseDateBound('2026-03-01T00:00:00+01:00')).toEqual({
      instant: Date.parse('2026-03-01T00:00:00+01:00'),
    });
  });

  it('rejects anything else', () => {
    expect(() => parseDateBound('March')).toThrow('Cannot read the date');
  });
});

describe('inDateRange', () => {
  const day = '2026-03-01T00:00:00+01:00';

  it('includes both calendar-day bounds in the record time zone', () => {
    expect(inDateRange(day, '01.03.2026', '01.03.2026')).toBe(true);
    expect(inDateRange(day, '02.03.2026', undefined)).toBe(false);
    expect(inDateRange(day, undefined, '28.02.2026')).toBe(false);
  });

  it('includes both instant bounds by default', () => {
    const instant = String(Date.parse(day) / 1000);
    expect(inDateRange(day, instant, instant)).toBe(true);
  });

  it('can make an instant end exclusive, but never a calendar day', () => {
    const instant = String(Date.parse(day) / 1000);
    expect(inDateRange(day, undefined, instant, { endExclusive: true })).toBe(
      false,
    );
    expect(
      inDateRange(day, undefined, '01.03.2026', { endExclusive: true }),
    ).toBe(true);
  });

  it('excludes records without a date only when a bound is given', () => {
    expect(inDateRange(null, undefined, undefined)).toBe(true);
    expect(inDateRange(null, '01.03.2026', undefined)).toBe(false);
  });
});

describe('matchesChangeFilters', () => {
  const record = {
    create: '2026-01-01T10:00:00+01:00',
    update: '2026-01-05T10:00:00+01:00',
  };

  it('treats both bounds as inclusive, like the API', () => {
    expect(
      matchesChangeFilters(record, {
        updatedAfter: '2026-01-05T09:00:00Z',
        updatedBefore: '2026-01-05T09:00:00Z',
      }),
    ).toBe(true);
    expect(matchesChangeFilters(record, { createdAfter: '2026-01-02' })).toBe(
      false,
    );
  });

  it('matches everything without filters', () => {
    expect(matchesChangeFilters({}, {})).toBe(true);
  });
});
