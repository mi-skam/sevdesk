import type { Invoice } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import overdue, {
  overdueInvoices,
  parseDay,
  todayInGermany,
} from '../src/commands/invoices/overdue';
import { withStore } from '../src/store';

function invoice(
  id: string,
  fields: Partial<Record<keyof Invoice, unknown>> = {},
): Invoice {
  return {
    id,
    objectName: 'Invoice',
    invoiceNumber: `RE-${id}`,
    invoiceType: 'RE',
    contact: { id: '7', objectName: 'Contact', name: 'ACME GmbH' },
    invoiceDate: '2026-01-10T00:00:00+01:00',
    timeToPay: '14',
    status: '200',
    sumGross: '119',
    paidAmount: 0,
    ...fields,
  } as unknown as Invoice;
}

describe('overdueInvoices', () => {
  it('is overdue from the day after invoice date plus payment term', () => {
    const invoices = [invoice('1')];
    expect(overdueInvoices(invoices, '2026-01-24')).toEqual([]);
    expect(overdueInvoices(invoices, '2026-01-25')).toEqual([
      {
        id: '1',
        invoiceNumber: 'RE-1',
        contact: { id: '7', objectName: 'Contact', name: 'ACME GmbH' },
        invoiceDate: '2026-01-10',
        dueDate: '2026-01-24',
        daysOverdue: 1,
        status: '200',
        sumGross: '119',
        paidAmount: '0',
        openAmount: '119',
      },
    ]);
  });

  it('uses the document day of a late-evening invoice date', () => {
    const [late] = overdueInvoices(
      [
        invoice('1', {
          invoiceDate: '2026-03-31T23:30:00+02:00',
          timeToPay: '0',
        }),
      ],
      '2026-04-01',
    );
    expect(late?.dueDate).toBe('2026-03-31');
  });

  it('subtracts partial payments exactly and sorts the most overdue first', () => {
    const result = overdueInvoices(
      [
        invoice('1', { invoiceDate: '2026-02-01T00:00:00+01:00' }),
        invoice('2', { status: '750', sumGross: '100.1', paidAmount: 0.2 }),
        invoice('3', { timeToPay: null }),
      ],
      '2026-03-01',
    );
    expect(result.map((r) => [r.id, r.dueDate, r.openAmount])).toEqual([
      ['3', '2026-01-10', '119'],
      ['2', '2026-01-24', '99.9'],
      ['1', '2026-02-15', '119'],
    ]);
  });
});

describe('dates', () => {
  it('reads YYYY-MM-DD and dd.mm.yyyy and rejects impossible days', () => {
    expect(parseDay('2026-11-13')).toBe('2026-11-13');
    expect(parseDay('3.1.2026')).toBe('2026-01-03');
    expect(() => parseDay('2026-02-30')).toThrow('Cannot read the date');
    expect(() => parseDay('yesterday')).toThrow('Cannot read the date');
  });

  it('takes today in German time', () => {
    expect(todayInGermany(new Date('2026-11-13T23:30:00Z'))).toBe('2026-11-14');
    expect(todayInGermany(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01');
  });
});

describe('invoices:overdue', () => {
  const fetchMock = vi.fn();
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sevdesk-overdue-'));
    fetchMock.mockReset();
    vi.stubEnv('SEVDESK_TOKEN', 'test-token');
    vi.stubEnv('SEVDESK_DB', join(dir, 'sevdesk.db'));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('fetches open and partially paid invoices with their contact', async () => {
    fetchMock.mockImplementation(async (input: string) => {
      const url = new URL(input);
      const page =
        url.searchParams.get('offset') === '0'
          ? url.searchParams.get('status') === '200'
            ? [invoice('1')]
            : [invoice('2', { status: '750', paidAmount: 19 })]
          : [];
      return new Response(JSON.stringify({ objects: page }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await overdue.action(
      { date: '2026-02-01', json: true, local: false },
      undefined,
    );

    const urls = fetchMock.mock.calls.map((call) => new URL(call[0] as string));
    expect([
      ...new Set(urls.map((url) => url.searchParams.get('status'))),
    ]).toEqual(['200', '750']);
    expect(
      urls.every((url) => url.searchParams.get('embed') === 'contact'),
    ).toBe(true);
    const output = JSON.parse(log.mock.calls[0]?.[0] as string) as Array<{
      id: string;
      openAmount: string;
    }>;
    expect(output.map((o) => [o.id, o.openAmount])).toEqual([
      ['1', '119'],
      ['2', '100'],
    ]);
  });

  it('reads the local database like the API, hiding reminders', async () => {
    await withStore({ create: true }, (store) => {
      store.upsert(
        'invoices',
        [
          invoice('1'),
          invoice('2', { invoiceType: 'MA' }),
          invoice('3', { status: '1000' }),
          invoice('4', { contact: { id: '8', objectName: 'Contact' } }),
        ],
        new Date('2026-01-03T00:00:00Z'),
      );
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const info = vi.spyOn(consola, 'info').mockImplementation(() => {});

    await overdue.action(
      { date: '2026-02-01', contact: 7, json: false, local: true },
      undefined,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    const table = log.mock.calls.flat().join('\n');
    expect(table).toContain('RE-1');
    expect(table).not.toMatch(/RE-[234]/);
    expect(info).toHaveBeenCalledWith('1 overdue invoice, 119 open.');
  });

  it('says so when nothing is overdue', async () => {
    await withStore({ create: true }, (store) => {
      store.upsert(
        'invoices',
        [invoice('1')],
        new Date('2026-01-03T00:00:00Z'),
      );
    });
    const info = vi.spyOn(consola, 'info').mockImplementation(() => {});

    await overdue.action(
      { date: '2026-01-24', json: false, local: true },
      undefined,
    );

    expect(info).toHaveBeenCalledWith('No overdue invoices on 2026-01-24.');
  });
});
