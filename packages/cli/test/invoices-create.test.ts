import { consola } from 'consola';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processConfig } from 'zodline';
import command, { invoiceCreateSchema } from '../src/commands/invoices/create';
import { isInteractive } from '../src/interactive';
import { promptConfirm } from '../src/prompt';

vi.mock('../src/interactive', () => ({ isInteractive: vi.fn(() => false) }));
vi.mock('../src/prompt', () => ({ promptConfirm: vi.fn() }));

const fixture = () => ({
  invoice: {
    contactId: 7,
    contactPersonId: 8,
    invoiceDate: '2024-02-29',
    deliveryDate: '2024-02-01',
    deliveryDateUntil: '2024-02-28',
    currency: 'EUR',
    taxRuleId: 1,
    taxText: 'Umsatzsteuer 19%',
    showNet: true,
    timeToPay: 14,
  },
  positions: [
    {
      name: 'Example consulting',
      quantity: 2,
      price: 100,
      taxRate: 19,
      unityId: 1,
    },
    {
      name: 'Example support',
      quantity: 1,
      price: 50,
      taxRate: 19,
      unityId: 1,
    },
  ],
});

describe('invoices:create', () => {
  let directory: string;
  let file: string;
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sevdesk-create-'));
    file = join(directory, 'invoice.json');
    await writeFile(file, JSON.stringify(fixture()));
    vi.stubEnv('SEVDESK_TOKEN', 'test-token');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      const objects = path.endsWith('/getByType')
        ? {
            id: '12',
            forObject: 'Invoice',
            type: 'RE',
            format: 'RE-%NUMBER',
            nextSequence: '1',
          }
        : init?.method === 'GET'
          ? []
          : {
              invoice: { id: '42', status: '100', invoiceNumber: 'RE-1' },
              invoicePos: [],
            };
      return new Response(JSON.stringify({ objects }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(consola, 'success').mockImplementation(() => {});
    vi.spyOn(consola, 'info').mockImplementation(() => {});
    vi.spyOn(consola, 'error').mockImplementation(() => {});
    vi.mocked(isInteractive).mockReturnValue(false);
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });
  const options = () => ({ yes: true, json: true, dryRun: false });

  it('parses invoice.json as a required positional argument and previews it without network access', async () => {
    const parsed = processConfig({ commands: { 'invoices:create': command } }, [
      'invoices:create',
      file,
      '--dry-run',
      '--json',
    ]);
    expect(parsed.args).toEqual([file]);
    expect(parsed.options).not.toHaveProperty('file');
    await parsed.command.action(parsed.options, parsed.args);
    expect(JSON.parse(vi.mocked(console.log).mock.calls[0]?.[0]).dryRun).toBe(
      true,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    ['invoices:create'],
    ['invoices:create', '--file', 'invoice.json'],
    ['invoices:create', 'invoice.json', 'extra.json'],
  ])(
    'rejects missing, legacy, or extra input arguments before any network access: %j',
    (...args) => {
      expect(() =>
        processConfig({ commands: { 'invoices:create': command } }, args),
      ).toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('supports a positional file path containing spaces', async () => {
    const path = join(directory, 'invoice with spaces.json');
    await writeFile(path, JSON.stringify(fixture()));
    const parsed = processConfig({ commands: { 'invoices:create': command } }, [
      'invoices:create',
      path,
      '--dry-run',
      '--json',
    ]);
    await parsed.command.action(parsed.options, parsed.args);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('creates exactly one draft with ordered positions and prints JSON', async () => {
    await command.action(options(), [file]);
    const posts = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === 'POST',
    );
    expect(posts).toHaveLength(1);
    const [url, init] = posts[0]!;
    expect(String(url)).toContain('/Invoice/Factory/saveInvoice');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body));
    expect(body.invoice).toMatchObject({
      status: 100,
      invoiceType: 'RE',
      invoiceNumber: 'RE-1',
      header: 'Rechnung Nr. RE-1',
      showNet: true,
      invoiceDate: '29.02.2024',
      contact: { id: 7, objectName: 'Contact' },
    });
    expect(
      body.invoicePosSave.map(
        (p: { positionNumber: number }) => p.positionNumber,
      ),
    ).toEqual([0, 1]);
    expect(body.takeDefaultAddress).toBe(true);
    expect(
      JSON.parse(vi.mocked(console.log).mock.calls[0]?.[0]).invoice.id,
    ).toBe('42');
  });
  it('selects highest existing invoice number plus one, including drafts, and sends it explicitly', async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (
        url.pathname.endsWith('/Invoice') &&
        !url.searchParams.has('invoiceNumber')
      ) {
        expect(url.searchParams.get('showAll')).toBe('1');
        return new Response(
          JSON.stringify({
            objects:
              url.searchParams.get('offset') === '0'
                ? [
                    { invoiceNumber: 'RE-9', status: '100' },
                    { invoiceNumber: 'RE-10', status: '100' },
                  ]
                : [],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }
      return original(input, init);
    });
    await command.action(options(), [file]);
    const post = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'POST',
    )!;
    expect(JSON.parse(String(post[1]?.body)).invoice).toMatchObject({
      invoiceNumber: 'RE-11',
      header: 'Rechnung Nr. RE-11',
    });
  });
  it('preserves an explicit invoice number and subject without reading the sequence', async () => {
    await writeFile(
      file,
      JSON.stringify({
        ...fixture(),
        invoice: {
          ...fixture().invoice,
          invoiceNumber: 'CUSTOM-7',
          header: 'Agreed subject',
        },
      }),
    );
    await command.action(options(), [file]);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/getByType')),
    ).toBe(false);
    const post = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'POST',
    )!;
    expect(JSON.parse(String(post[1]?.body)).invoice).toMatchObject({
      invoiceNumber: 'CUSTOM-7',
      header: 'Agreed subject',
    });
  });
  it('refuses a number that became occupied without posting or silently choosing another', async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.searchParams.get('invoiceNumber') === 'RE-1')
        return new Response(
          JSON.stringify({
            objects:
              url.searchParams.get('offset') === '0'
                ? [{ invoiceNumber: 'RE-1' }]
                : [],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      return original(input, init);
    });
    await expect(command.action(options(), [file])).rejects.toThrow(
      'bereits vergeben',
    );
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(false);
  });
  it('exposes pending numbering in offline preview', async () => {
    await command.action({ ...options(), dryRun: true }, [file]);
    expect(
      JSON.parse(vi.mocked(console.log).mock.calls[0]?.[0]).numbering,
    ).toEqual({ mode: 'automatic', pending: true, reserved: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('treats a blank invoice number as automatic', () => {
    expect(
      invoiceCreateSchema.parse({
        ...fixture(),
        invoice: { ...fixture().invoice, invoiceNumber: ' ' },
      }).invoice.invoiceNumber,
    ).toBeUndefined();
  });
  it('prints a human-readable success message', async () => {
    await command.action({ ...options(), json: false }, [file]);
    expect(consola.success).toHaveBeenCalledWith(
      expect.stringContaining('Not sent or finalized'),
    );
  });
  it('dry-run validates without any network calls', async () => {
    await command.action({ ...options(), dryRun: true, yes: false }, [file]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(vi.mocked(console.log).mock.calls[0]?.[0]).dryRun).toBe(
      true,
    );
  });
  it('requires confirmation in non-interactive mode', async () => {
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    await expect(
      command.action({ ...options(), yes: false }, [file]),
    ).rejects.toThrow('exit');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('honors declined confirmation', async () => {
    vi.mocked(isInteractive).mockReturnValue(true);
    vi.mocked(promptConfirm).mockResolvedValue(false);
    await command.action({ ...options(), yes: false }, [file]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON before network access', async () => {
    await writeFile(file, '{');
    await expect(command.action(options(), [file])).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reports a missing input file without network access', async () => {
    await expect(
      command.action(options(), [join(directory, 'missing')]),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { invoice: { ...fixture().invoice, status: 200 } },
    { invoice: { ...fixture().invoice, id: 42 } },
    { invoice: { ...fixture().invoice, invoiceDate: '2024-02-30' } },
    { invoice: { ...fixture().invoice, deliveryDateUntil: '2024-01-01' } },
    { invoice: { ...fixture().invoice, deliveryDate: '2024-03-01' } },
    { invoice: { ...fixture().invoice, showNet: undefined } },
    { invoice: { ...fixture().invoice, taxRuleId: 0 } },
    { positions: [] },
    { positions: [{ ...fixture().positions[0], quantity: -1 }] },
    { positions: [{ ...fixture().positions[0], taxRate: 101 }] },
    { positions: [{ ...fixture().positions[0], price: '100' }] },
  ])('rejects unsafe or incomplete payload %j', async (override) => {
    await writeFile(file, JSON.stringify({ ...fixture(), ...override }));
    await expect(command.action(options(), [file])).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('defaults only status and regular invoice type', () => {
    expect(invoiceCreateSchema.parse(fixture()).invoice).toMatchObject({
      status: 100,
      invoiceType: 'RE',
    });
  });
  it('does not retry an ambiguous failed POST', async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === 'POST') throw new Error('network failed');
      return original(input, init);
    });
    await expect(command.action(options(), [file])).rejects.toThrow(
      'network failed',
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  });
});
