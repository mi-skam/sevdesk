import { describe, expect, it } from 'vitest';
import { toFilterEnd, toFilterStart } from '../src/dates';

const seconds = (iso: string) => Date.parse(iso) / 1000;

describe('toFilterStart', () => {
  it('turns a calendar day into midnight in German winter time', () => {
    expect(toFilterStart('01.01.2024')).toBe(
      seconds('2024-01-01T00:00:00+01:00'),
    );
    expect(toFilterStart('2024-01-01')).toBe(
      seconds('2024-01-01T00:00:00+01:00'),
    );
    expect(toFilterStart('1.1.2024')).toBe(
      seconds('2024-01-01T00:00:00+01:00'),
    );
  });

  it('turns a calendar day into midnight in German summer time', () => {
    expect(toFilterStart('15.07.2026')).toBe(
      seconds('2026-07-15T00:00:00+02:00'),
    );
  });

  it('handles the days daylight saving time starts and ends', () => {
    expect(toFilterStart('29.03.2026')).toBe(
      seconds('2026-03-29T00:00:00+01:00'),
    );
    expect(toFilterStart('25.10.2026')).toBe(
      seconds('2026-10-25T00:00:00+02:00'),
    );
  });

  it('passes instants through as Unix seconds', () => {
    expect(toFilterStart(1767225600)).toBe(1767225600);
    expect(toFilterStart('1767225600')).toBe(1767225600);
    expect(toFilterStart(new Date('2026-01-01T00:00:00.900Z'))).toBe(
      1767225600,
    );
    expect(toFilterStart('2026-01-01T01:00:00+01:00')).toBe(1767225600);
  });

  it('rejects anything else instead of sending a filter the API ignores', () => {
    expect(() => toFilterStart('March 2026')).toThrow('Cannot read the date');
    expect(() => toFilterStart('31.02.2026')).toThrow('Cannot read the date');
  });
});

describe('toFilterEnd', () => {
  it('turns a calendar day into its last second in German time', () => {
    expect(toFilterEnd('31.01.2024')).toBe(
      seconds('2024-02-01T00:00:00+01:00') - 1,
    );
    expect(toFilterEnd('2026-07-15')).toBe(
      seconds('2026-07-16T00:00:00+02:00') - 1,
    );
  });

  it('crosses month, year and daylight saving boundaries', () => {
    expect(toFilterEnd('31.12.2025')).toBe(
      seconds('2026-01-01T00:00:00+01:00') - 1,
    );
    expect(toFilterEnd('28.03.2026')).toBe(
      seconds('2026-03-29T00:00:00+01:00') - 1,
    );
    expect(toFilterEnd('29.03.2026')).toBe(
      seconds('2026-03-30T00:00:00+02:00') - 1,
    );
  });

  it('leaves instants unchanged', () => {
    expect(toFilterEnd('1767225600')).toBe(1767225600);
    expect(toFilterEnd(new Date('2026-01-01T00:00:00Z'))).toBe(1767225600);
  });
});
