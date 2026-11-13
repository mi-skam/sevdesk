import { afterEach, describe, expect, it, vi } from 'vitest';

import { displayWidth, printTable } from '../src/output';

describe('displayWidth', () => {
  it('counts terminal columns, not code units', () => {
    expect(displayWidth('ACME GmbH')).toBe(9);
    expect(displayWidth('Société')).toBe(7);
    expect(displayWidth('Société')).toBe(7);
    expect(displayWidth('株式会社')).toBe(8);
    expect(displayWidth('ＡＣＭＥ')).toBe(8);
    expect(displayWidth('한국')).toBe(4);
    expect(displayWidth('🚀')).toBe(2);
    expect(displayWidth('👍🏽')).toBe(2);
    expect(displayWidth('')).toBe(0);
  });
});

describe('printTable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aligns columns after wide characters', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    printTable([
      { contact: 'ACME', creditor: '70000' },
      { contact: '株式会社', creditor: '70001' },
    ]);
    const lines = log.mock.calls.map(([line]) => String(line).trimEnd());
    expect(lines).toEqual([
      'CONTACT   CREDITOR',
      'ACME      70000',
      '株式会社  70001',
    ]);
  });
});
