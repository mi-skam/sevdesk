import { consola } from 'consola';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineConfig, processConfig } from 'zodline';
import { requireClient } from '../src/client';
import create from '../src/commands/quotes/create';
import get from '../src/commands/quotes/get';
import list from '../src/commands/quotes/list';
import pdf from '../src/commands/quotes/pdf';
import send from '../src/commands/quotes/send';
import { isInteractive } from '../src/interactive';
import { quoteDialogue } from '../src/quotes/dialogue';
import { emptyQuote } from '../src/quotes/model';
import { quoteFixture } from './quotes-fixtures';

vi.mock('../src/client', () => ({ requireClient: vi.fn() }));
vi.mock('../src/interactive', () => ({ isInteractive: vi.fn(() => false) }));
vi.mock('../src/quotes/dialogue', () => ({
  quoteDialogue: vi.fn(),
  quoteSummary: vi.fn(() => 'Summary'),
}));
const contact = {
  id: '7',
  name: 'Example',
  customerNumber: 'C-TEST',
  category: { id: '3' },
  status: '1000',
};
const order = {
  id: '42',
  orderNumber: 'AN-TEST',
  orderType: 'AN',
  status: '100',
  sendDate: null,
  sumNet: '200',
  sumTax: '38',
  sumGross: '238',
};
const mock = {
  basics: { getNumberSequence: vi.fn() },
  contacts: { list: vi.fn(), get: vi.fn() },
  contactAddresses: { list: vi.fn() },
  orders: {
    list: vi.fn(),
    save: vi.fn(),
    get: vi.fn(),
    sendViaEmail: vi.fn(),
    getPdf: vi.fn(),
    listPositions: vi.fn(),
  },
};
describe('quote command signatures', () => {
  let dir: string, file: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sevdesk-quote-command-'));
    file = join(dir, 'quote.json');
    await writeFile(file, JSON.stringify(quoteFixture()));
    vi.mocked(requireClient).mockResolvedValue(
      mock as unknown as Awaited<ReturnType<typeof requireClient>>,
    );
    vi.mocked(isInteractive).mockReturnValue(false);
    mock.contacts.list.mockImplementation(async ({ offset }) =>
      offset === 0 ? [contact] : [],
    );
    mock.contacts.get.mockResolvedValue(contact);
    mock.contactAddresses.list.mockImplementation(async ({ offset }) =>
      offset === 0
        ? [
            {
              contact: { id: '7' },
              street: 'Example 1',
              zip: '12345',
              city: 'City',
              country: { id: '1' },
            },
          ]
        : [],
    );
    mock.basics.getNumberSequence.mockResolvedValue({
      id: '12',
      forObject: 'Order',
      type: 'AN',
      format: 'AN-%NUMBER',
      nextSequence: '2',
    });
    mock.orders.list.mockResolvedValue([]);
    mock.orders.save.mockResolvedValue({ order, positions: [] });
    mock.orders.get.mockResolvedValue(order);
    mock.orders.sendViaEmail.mockResolvedValue([{ id: '99' }]);
    mock.orders.getPdf.mockResolvedValue({
      filename: 'quote.pdf',
      content: Buffer.from('PDF').toString('base64'),
    });
    mock.orders.listPositions.mockResolvedValue([]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(consola, 'info').mockImplementation(() => {});
    vi.spyOn(consola, 'success').mockImplementation(() => {});
  });
  afterEach(async () => {
    process.exitCode = 0;
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await rm(dir, { recursive: true, force: true });
  });
  const options = () => ({
    interactive: false,
    dryRun: false,
    check: false,
    send: false,
    json: true,
    receipt: join(dir, 'operation.json'),
  });
  const output = () =>
    JSON.parse(vi.mocked(console.log).mock.calls.at(-1)?.[0]);
  it('parses the optional positional file and rejects extra positional files', () => {
    const config = defineConfig({
      meta: { name: 'test', version: '1' },
      commands: { create },
    });
    expect(
      processConfig(config, ['create', file, '--dry-run', '--json']).args,
    ).toEqual([file]);
    expect(
      processConfig(config, ['create', '--dry-run', '--json']).args,
    ).toEqual([]);
    expect(() =>
      processConfig(config, ['create', file, file, '--dry-run']),
    ).toThrow();
  });
  it.each(['get', 'pdf', 'send'] as const)(
    '%s requires the quote ID first and rejects removed --id syntax',
    (name) => {
      const selected = { get, pdf, send }[name];
      const parse = (args: string[]) =>
        processConfig({ commands: { [name]: selected } }, [name, ...args]);
      const tail = name === 'send' ? [file] : [];
      const flags = name === 'pdf' ? ['--output', join(dir, 'q.pdf')] : [];
      const parsed = parse(['42', ...tail, ...flags, '--json']);
      expect(parsed.args).toEqual(name === 'send' ? [42, file] : [42]);
      expect(parsed.options).not.toHaveProperty('id');
      for (const args of [
        [...tail, '--id', '42', ...flags],
        ['42', ...tail, '--id=42', ...flags],
        [...tail, ...flags],
        ['0', ...tail, ...flags],
        ['NaN', ...tail, ...flags],
        ['42', ...tail, 'extra', ...flags],
      ])
        expect(() => parse(args)).toThrow();
      expect(requireClient).not.toHaveBeenCalled();
      expect(mock.orders.sendViaEmail).not.toHaveBeenCalled();
    },
  );
  it('routes positional send input through parsing and previews without authentication', async () => {
    const parsed = processConfig({ commands: { send } }, [
      'send',
      '42',
      file,
      '--dry-run',
      '--json',
    ]);
    await parsed.command.action(parsed.options, parsed.args);
    expect(output()).toMatchObject({ dryRun: true, orderId: 42 });
    expect(requireClient).not.toHaveBeenCalled();
    expect(mock.orders.sendViaEmail).not.toHaveBeenCalled();
  });
  it('routes positional send input to the existing quote without creating another', async () => {
    const parsed = processConfig({ commands: { send } }, [
      'send',
      '42',
      file,
      '--receipt',
      join(dir, 'parsed-send.json'),
      '--json',
    ]);
    await parsed.command.action(parsed.options, parsed.args);
    expect(output().state).toBe('sent');
    expect(mock.orders.save).not.toHaveBeenCalled();
    expect(mock.orders.sendViaEmail).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 42 }),
    );
  });
  it('omitted positional file previews an empty quote offline', async () => {
    await create.action({ ...options(), dryRun: true }, []);
    expect(output()).toMatchObject({
      readyToSave: false,
      quote: { customer: null, positions: [] },
    });
    expect(requireClient).not.toHaveBeenCalled();
  });
  it('refuses saving an empty quote before authentication', async () => {
    await expect(create.action({ ...options() }, [])).rejects.toThrow();
    expect(requireClient).not.toHaveBeenCalled();
    expect(mock.orders.save).not.toHaveBeenCalled();
  });
  it('a positional file defaults to review/edit dialogue in a terminal', async () => {
    vi.mocked(isInteractive).mockReturnValue(true);
    vi.mocked(quoteDialogue).mockResolvedValue(undefined);
    await create.action({ ...options(), json: false }, [file]);
    expect(quoteDialogue).toHaveBeenCalledWith(
      expect.any(Function),
      quoteFixture(),
    );
  });
  it('no positional file starts the empty-customer dialogue in a terminal', async () => {
    vi.mocked(isInteractive).mockReturnValue(true);
    vi.mocked(quoteDialogue).mockResolvedValue(undefined);
    await create.action({ ...options(), json: false }, []);
    expect(quoteDialogue).toHaveBeenCalledWith(expect.any(Function), undefined);
  });
  it('dry-run is offline and never resolves authentication', async () => {
    await create.action({ ...options(), dryRun: true }, [file]);
    expect(requireClient).not.toHaveBeenCalled();
    expect(quoteDialogue).not.toHaveBeenCalled();
    expect(output()).toMatchObject({
      dryRun: true,
      readyToSave: true,
      accountValidated: false,
      sendRequested: false,
    });
  });
  it('previews incomplete drafts without pretending they are ready', async () => {
    await writeFile(file, JSON.stringify(emptyQuote()));
    await create.action({ ...options(), dryRun: true }, [file]);
    expect(output()).toMatchObject({ readyToSave: false });
    expect(output().issues.length).toBeGreaterThan(0);
  });
  it('previews pending automatic numbering offline without account requests', async () => {
    const q = quoteFixture();
    delete q.document.number;
    await writeFile(file, JSON.stringify(q));
    await create.action({ ...options(), dryRun: true }, [file]);
    expect(output()).toMatchObject({
      numbering: { mode: 'automatic', pending: true, reserved: false },
      readyToResolveNumber: true,
    });
    expect(requireClient).not.toHaveBeenCalled();
  });
  it('resolves an omitted number for --check and returns it without writing', async () => {
    const q = quoteFixture();
    delete q.document.number;
    await writeFile(file, JSON.stringify(q));
    await create.action({ ...options(), check: true }, [file]);
    expect(output().quote.document.number).toBe('AN-2');
    expect(mock.orders.save).not.toHaveBeenCalled();
    expect(mock.orders.sendViaEmail).not.toHaveBeenCalled();
  });
  it('saves an automatically numbered quote and includes the number in its recovery draft', async () => {
    const q = quoteFixture();
    delete q.document.number;
    await writeFile(file, JSON.stringify(q));
    mock.orders.save.mockImplementationOnce(async ({ order: payload }) => ({
      order: { ...order, orderNumber: payload.orderNumber },
    }));
    await create.action(options(), [file]);
    expect(mock.orders.save).toHaveBeenCalledWith(
      expect.objectContaining({
        order: expect.objectContaining({
          orderNumber: 'AN-2',
          header: q.document.heading,
        }),
      }),
    );
    expect(output().orderNumber).toBe('AN-2');
    expect(mock.basics.getNumberSequence).toHaveBeenCalledTimes(1);
    const { readFile } = await import('node:fs/promises');
    expect(
      JSON.parse(await readFile(output().draftFile, 'utf8')).document.number,
    ).toBe('AN-2');
  });
  it('does not replace or look up an explicit number', async () => {
    await create.action(options(), [file]);
    expect(mock.basics.getNumberSequence).not.toHaveBeenCalled();
    expect(mock.orders.save).toHaveBeenCalledWith(
      expect.objectContaining({
        order: expect.objectContaining({ orderNumber: 'AN-TEST' }),
      }),
    );
  });
  it('stops before creating when automatic numbering cannot be read', async () => {
    const q = quoteFixture();
    delete q.document.number;
    await writeFile(file, JSON.stringify(q));
    mock.basics.getNumberSequence.mockRejectedValueOnce(
      new Error('Numbering unavailable'),
    );
    await expect(create.action(options(), [file])).rejects.toThrow(
      'Numbering unavailable',
    );
    expect(mock.orders.save).not.toHaveBeenCalled();
    expect(mock.orders.sendViaEmail).not.toHaveBeenCalled();
  });
  it('does not write after an automatically suggested number becomes occupied', async () => {
    const q = quoteFixture();
    delete q.document.number;
    await writeFile(file, JSON.stringify(q));
    mock.orders.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...order, orderNumber: 'AN-2' }])
      .mockResolvedValueOnce([]);
    await expect(create.action(options(), [file])).rejects.toThrow(
      'already exists',
    );
    expect(mock.orders.save).not.toHaveBeenCalled();
  });
  it('bare positional input saves directly outside a terminal without machine flags', async () => {
    await create.action({ ...options(), json: false }, [file]);
    expect(mock.orders.save).toHaveBeenCalledTimes(1);
    expect(mock.orders.sendViaEmail).not.toHaveBeenCalled();
    expect(quoteDialogue).not.toHaveBeenCalled();
  });
  it('structured mode saves without a confirmation flag and never prompts', async () => {
    await create.action(options(), [file]);
    expect(output()).toMatchObject({ state: 'saved', orderId: '42' });
    expect(mock.orders.save).toHaveBeenCalledTimes(1);
    expect(mock.orders.sendViaEmail).not.toHaveBeenCalled();
    expect(quoteDialogue).not.toHaveBeenCalled();
  });
  it('requires a terminal without file input', async () => {
    await expect(
      create.action({ ...options(), json: false }, []),
    ).rejects.toThrow('terminal');
    expect(requireClient).not.toHaveBeenCalled();
  });
  it('rejects mixed dialogue/machine flags and mutually exclusive validation modes', async () => {
    vi.mocked(isInteractive).mockReturnValue(true);
    await expect(
      create.action({ ...options(), interactive: true }, [file]),
    ).rejects.toThrow('does not accept');
    await expect(
      create.action({ ...options(), check: true, dryRun: true }, [file]),
    ).rejects.toThrow('not both');
  });
  it('loads a positional file into the dialogue with an explicit flag', async () => {
    vi.mocked(isInteractive).mockReturnValue(true);
    vi.mocked(quoteDialogue).mockResolvedValue(undefined);
    await create.action({ ...options(), interactive: true, json: false }, [
      file,
    ]);
    expect(quoteDialogue).toHaveBeenCalledWith(
      expect.any(Function),
      quoteFixture(),
    );
    expect(mock.orders.save).not.toHaveBeenCalled();
  });
  it('check performs read-only resolution, without creating or sending', async () => {
    await create.action({ ...options(), check: true }, [file]);
    expect(output().accountValidated).toMatchObject({
      customer: true,
      otherIds: false,
      taxCorrectness: false,
    });
    expect(mock.orders.save).not.toHaveBeenCalled();
    expect(mock.orders.sendViaEmail).not.toHaveBeenCalled();
  });
  it('creates a draft only unless --send was explicit', async () => {
    await create.action({ ...options() }, [file]);
    expect(output()).toMatchObject({ state: 'saved', orderId: '42' });
    expect(mock.orders.save).toHaveBeenCalledTimes(1);
    expect(mock.orders.sendViaEmail).not.toHaveBeenCalled();
  });
  it('explicit --send saves and sends exactly once', async () => {
    await create.action({ ...options(), send: true }, [file]);
    expect(output().state).toBe('sent');
    expect(mock.orders.sendViaEmail).toHaveBeenCalledTimes(1);
  });
  it('reports partial success as structured output and exit code 1', async () => {
    mock.orders.sendViaEmail.mockRejectedValueOnce(new Error('timeout'));
    await create.action({ ...options(), send: true }, [file]);
    expect(output()).toMatchObject({ state: 'send-unknown', orderId: '42' });
    expect(process.exitCode).toBe(1);
    expect(mock.orders.save).toHaveBeenCalledTimes(1);
  });
  it('standalone send dry-run validates offline, then sending needs no confirmation flag', async () => {
    const o = { dryRun: true, json: true };
    await send.action(o, [42, file]);
    expect(requireClient).not.toHaveBeenCalled();
    expect(output().dryRun).toBe(true);
    await send.action(
      { ...o, dryRun: false, receipt: join(dir, 'send-preview.json') },
      [42, file],
    );
    expect(output().state).toBe('sent');
    expect(mock.orders.sendViaEmail).toHaveBeenCalledTimes(1);
  });
  it('standalone send uses the saved quote ID without another save', async () => {
    await send.action(
      {
        dryRun: false,
        receipt: join(dir, 'send.json'),
        json: true,
      },
      [42, file],
    );
    expect(mock.orders.save).not.toHaveBeenCalled();
    expect(mock.orders.sendViaEmail).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 42 }),
    );
  });
  it('lists only quotes and paginates raw orders before applying limit', async () => {
    mock.orders.list
      .mockResolvedValueOnce([{ ...order, id: '1', orderType: 'AB' }])
      .mockResolvedValueOnce([order]);
    await list.action({ limit: 1, json: true }, undefined);
    expect(output()).toEqual([order]);
    expect(mock.orders.list.mock.calls[1]?.[0]).toMatchObject({ offset: 1 });
  });
  it('rejects non-quote IDs for quote get and PDF', async () => {
    mock.orders.get.mockResolvedValue({ ...order, orderType: 'AB' });
    await expect(
      get.action({ positions: false, json: true }, [42]),
    ).rejects.toThrow('not a quote');
    await expect(
      pdf.action({ output: join(dir, 'q.pdf'), json: true }, [42]),
    ).rejects.toThrow('not a quote');
    expect(mock.orders.getPdf).not.toHaveBeenCalled();
  });
  it('retrieves a quote and all positions', async () => {
    mock.orders.listPositions
      .mockResolvedValueOnce([{ id: '99' }])
      .mockResolvedValueOnce([]);
    await get.action({ positions: true, json: true }, [42]);
    expect(output()).toEqual({ quote: order, positions: [{ id: '99' }] });
  });
  it('PDF preview never marks sent and refuses overwrites', async () => {
    const o = { output: join(dir, 'q.pdf'), json: true };
    await pdf.action(o, [42]);
    expect(mock.orders.getPdf).toHaveBeenCalledWith({
      orderId: 42,
      preventSendBy: true,
    });
    await expect(pdf.action(o, [42])).rejects.toThrow();
    expect(mock.orders.sendViaEmail).not.toHaveBeenCalled();
  });
});
