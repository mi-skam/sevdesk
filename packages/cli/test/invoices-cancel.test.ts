import { consola } from 'consola';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processConfig } from 'zodline';
import cancelCommand from '../src/commands/invoices/cancel';
import { isInteractive } from '../src/interactive';
import { promptConfirm } from '../src/prompt';

vi.mock('../src/interactive', () => ({ isInteractive: vi.fn(() => false) }));
vi.mock('../src/prompt', () => ({ promptConfirm: vi.fn() }));

const open = {
  id: '9002',
  objectName: 'Invoice',
  invoiceNumber: 'RE-2',
  invoiceType: 'RE',
  status: '200',
  contact: { id: '1001', objectName: 'Contact', name: 'ACME Testbau GmbH' },
  sendType: 'VPDF',
  sendDate: '2030-01-09T10:02:42+01:00',
  sumGross: '1190',
  currency: 'EUR',
};
const cancellation = {
  ...open,
  id: '9003',
  invoiceNumber: 'RE-3',
  invoiceType: 'SR',
  status: '1000',
  sendDate: null,
  sumGross: '-1190',
  origin: { id: '9002', objectName: 'Invoice' },
};
const sequence = {
  id: '12',
  forObject: 'Invoice',
  type: 'RE',
  format: 'RE-%NUMBER',
  nextSequence: '3',
};

function response(objects: unknown) {
  return new Response(JSON.stringify({ objects }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function run(...args: string[]) {
  const parsed = processConfig(
    { commands: { 'invoices:cancel': cancelCommand } },
    args,
  );
  await parsed.command.action(parsed.options, parsed.args);
}

describe('invoices:cancel', () => {
  const fetchMock = vi.fn<typeof fetch>();
  /** Routes by path; `numbered` answers the invoice-number lookups in order. */
  function route(invoice: unknown, numbered: unknown[][] = [[], []]) {
    const lookups = [...numbered];
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (init?.method === 'POST') return response(cancellation);
      if (url.pathname.endsWith('/SevSequence/Factory/getByType'))
        return response(sequence);
      if (url.pathname.endsWith('/Invoice')) {
        // fetchAll stops on an empty page.
        return response(
          url.searchParams.get('offset') === '0' ? (lookups.shift() ?? []) : [],
        );
      }
      return response([invoice]);
    });
  }
  const writes = () =>
    fetchMock.mock.calls.filter(([, init]) => init?.method !== 'GET');
  const output = () =>
    JSON.parse(vi.mocked(console.log).mock.calls.at(-1)?.[0]);

  beforeEach(() => {
    vi.stubEnv('SEVDESK_TOKEN', 'test-token');
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(isInteractive).mockReturnValue(false);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(consola, 'warn').mockImplementation(() => {});
    vi.spyOn(consola, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('checks the counter number, cancels once and prints both invoices', async () => {
    route(open);
    await run('invoices:cancel', '9002', '--yes', '--json');
    expect(writes()).toHaveLength(1);
    expect(String(writes()[0]![0])).toContain('/Invoice/9002/cancelInvoice');
    const lookup = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.searchParams.has('invoiceNumber'));
    expect(lookup?.searchParams.get('invoiceNumber')).toBe('RE-3');
    expect(lookup?.searchParams.get('showAll')).toBe('1');
    expect(output()).toEqual({
      cancelled: { invoiceId: '9002', invoiceNumber: 'RE-2' },
      cancellation,
    });
    expect(consola.warn).not.toHaveBeenCalled();
  });

  it('refuses when the counter number is already used by another invoice', async () => {
    route(open, [[{ id: '9100', invoiceNumber: 'RE-3', status: '100' }]]);
    await expect(run('invoices:cancel', '9002', '--yes')).rejects.toThrow(
      /RE-3 is already used by invoice ID 9100/,
    );
    expect(writes()).toHaveLength(0);
  });

  it('warns when the cancellation number turns out to be a duplicate', async () => {
    route(open, [[], [cancellation, { id: '9100', invoiceNumber: 'RE-3' }]]);
    await run('invoices:cancel', '9002', '--yes', '--json');
    expect(writes()).toHaveLength(1);
    expect(consola.warn).toHaveBeenCalledWith(
      expect.stringMatching(/RE-3 is now used 2 times/),
    );
  });

  it.each([
    [{ ...open, status: '100' }, /draft.*invoices:delete/],
    [{ ...open, status: '750' }, /status 750/],
    [{ ...open, status: '1000' }, /status 1000/],
    [cancellation, /type SR/],
  ])('refuses %j without writing', async (invoice, message) => {
    route(invoice);
    await expect(run('invoices:cancel', '9002', '--yes')).rejects.toThrow(
      message,
    );
    expect(writes()).toHaveLength(0);
  });

  it('refuses non-interactive cancelling without --yes', async () => {
    route(open);
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit 1');
    });
    await expect(run('invoices:cancel', '9002')).rejects.toThrow('exit 1');
    expect(writes()).toHaveLength(0);
  });

  it('names invoice, amount and cancellation number in the confirmation; declining does not write', async () => {
    route(open);
    vi.mocked(isInteractive).mockReturnValue(true);
    vi.mocked(promptConfirm).mockResolvedValue(false);
    await run('invoices:cancel', '9002');
    expect(promptConfirm).toHaveBeenCalledWith(
      expect.stringMatching(/RE-2.*ACME Testbau GmbH.*RE-3.*-1190 EUR/),
      false,
    );
    expect(writes()).toHaveLength(0);
  });
});
