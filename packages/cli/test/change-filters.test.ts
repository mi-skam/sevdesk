import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  changeFilterOptions,
  changeFilters,
  parseMoment,
} from '../src/change-filters';

describe('parseMoment', () => {
  it('reads Unix seconds', () => {
    expect(parseMoment('1767225600')?.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('reads a plain date as midnight UTC', () => {
    expect(parseMoment('2026-01-01')?.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('reads an ISO 8601 timestamp with offset', () => {
    expect(parseMoment('2026-01-01T01:00:00+01:00')?.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it.each(['yesterday', '01.01.2026', '2026-13-01', '2026-01-01T99:00'])(
    'rejects %s',
    (value) => {
      expect(parseMoment(value)).toBeUndefined();
    },
  );
});

describe('changeFilterOptions', () => {
  const schema = z.object(changeFilterOptions('vouchers'));

  it('accepts supported formats', () => {
    expect(
      schema.safeParse({ updatedAfter: '2026-01-01', createdBefore: '0' })
        .success,
    ).toBe(true);
  });

  it('rejects an unparseable moment with a hint', () => {
    const result = schema.safeParse({ updatedAfter: 'last week' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('YYYY-MM-DD');
  });
});

describe('changeFilters', () => {
  it('maps the command-line names to the SDK names', () => {
    expect(
      changeFilters({
        createdAfter: '2026-01-01',
        updatedBefore: '1767225600',
      }),
    ).toEqual({
      createAfter: new Date('2026-01-01T00:00:00Z'),
      createBefore: undefined,
      updateAfter: undefined,
      updateBefore: new Date('2026-01-01T00:00:00Z'),
    });
  });
});
