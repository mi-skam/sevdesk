import { describe, expect, it } from 'vitest';
import { quoteDate } from '../src/quotes/defaults';

describe('quote initialization (Angebotsvorgaben)', () => {
  it('uses the local calendar date for a new quote', () => {
    expect(quoteDate(new Date(2024, 0, 2, 0, 1))).toBe('2024-01-02');
  });
});
