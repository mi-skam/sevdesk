import { consola } from 'consola';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { processConfig, type CommandDefinition } from 'zodline';
import { idArgument, requireIdArgument } from '../src/arguments';
import { isInteractive } from '../src/interactive';
import { promptText } from '../src/prompt';

vi.mock('../src/interactive');
vi.mock('../src/prompt');

const modules = import.meta.glob<CommandDefinition<z.ZodObject, z.ZodType>>(
  '../src/commands/**/*.ts',
  { eager: true, import: 'default' },
);
const idCommands = [
  'accounts:get',
  'accounts:balance',
  'accounts-datev:get',
  'contacts:get',
  'contacts:update',
  'contacts:delete',
  'contacts:update-address',
  'contacts:delete-address',
  'credit-notes:get',
  'credit-notes:pdf',
  'invoices:get',
  'invoices:pdf',
  'orders:get',
  'orders:pdf',
  'parts:get',
  'tags:delete',
  'transactions:get',
  'vouchers:get',
  'vouchers:update',
  'vouchers:document',
  'vouchers:open',
  'vouchers:book',
  'vouchers:enshrine',
  'vouchers:reset-to-open',
  'vouchers:reset-to-draft',
  'contacts:add-address',
  'contacts:add-email',
  'contacts:add-phone',
];
function command(name: string) {
  const result = modules[`../src/commands/${name.replace(':', '/')}.ts`];
  if (!result) throw new Error(`Missing command: ${name}`);
  return result;
}
function parse(name: string, args: string[]) {
  return processConfig({ commands: { [name]: command(name) } }, [
    name,
    ...args,
  ]);
}

describe('positional primary inputs', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock.mockReset());
    vi.mocked(isInteractive).mockReturnValue(false);
    vi.spyOn(consola, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit(1)');
    }) as (code?: number) => never);
  });
  afterEach(() => {
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it.each(idCommands)(
    '%s accepts a positive integer ID as its primary argument',
    (name) => {
      const result = parse(name, ['42', '--json']);
      expect(result.args).toEqual([42]);
      expect(result.options.json).toBe(true);
      expect(result.options).not.toHaveProperty('id');
      expect(result.options).not.toHaveProperty('contact');
    },
  );
  it.each(idCommands)(
    '%s preserves omission for its existing interactive prompt',
    (name) => {
      expect(parse(name, ['--json']).args).toEqual([]);
    },
  );
  it.each(idCommands)(
    '%s rejects removed target flags, including alongside positional input',
    (name) => {
      const flag = name.startsWith('contacts:add-') ? '--contact' : '--id';
      for (const args of [[flag, '42'], [`${flag}=42`], ['42', flag, '43']]) {
        expect(() => parse(name, args)).toThrow();
      }
    },
  );
  it.each(idCommands)(
    '%s rejects invalid IDs and extra operands before executing anything',
    (name) => {
      for (const id of [
        '0',
        '-1',
        '1.5',
        'NaN',
        'Infinity',
        'abc',
        '9007199254740992',
      ]) {
        expect(() => parse(name, [id])).toThrow();
      }
      expect(() => parse(name, ['42', '43'])).toThrow();
    },
  );
  it('accepts a receipt file containing spaces and preserves voucher settings', () => {
    const result = parse('vouchers:create', [
      'receipt with spaces.pdf',
      '--status',
      'draft',
      '--amount',
      '119',
      '--supplier-id',
      '7',
      '--json',
    ]);
    expect(result.args).toEqual(['receipt with spaces.pdf']);
    expect(result.options).toMatchObject({
      status: 'draft',
      amount: 119,
      supplierId: 7,
      json: true,
    });
    expect(result.options).not.toHaveProperty('file');
    expect(parse('vouchers:create', []).args).toEqual([]);
  });
  it('rejects --file, empty receipt paths, and extra receipt operands', () => {
    for (const args of [
      ['--file', 'receipt.pdf'],
      ['--file=receipt.pdf'],
      ['receipt.pdf', '--file', 'other.pdf'],
      ['one.pdf', 'two.pdf'],
    ]) {
      expect(() => parse('vouchers:create', args)).toThrow();
    }
    expect(command('vouchers:create').args?.safeParse(['']).success).toBe(
      false,
    );
  });
  it('keeps named filters, relationship settings, output destinations and confirmations', () => {
    expect(
      parse('invoices:list', ['--contact', '7', '--limit', '5']).options,
    ).toMatchObject({ contact: 7, limit: 5 });
    expect(
      parse('vouchers:positions', ['--voucher', '42']).options.voucher,
    ).toBe(42);
    expect(
      parse('invoices:pdf', ['42', '--output', 'invoice.pdf']).options.output,
    ).toBe('invoice.pdf');
    expect(
      parse('vouchers:book', [
        '42',
        '--check-account',
        '7',
        '--transaction',
        '8',
        '--yes',
      ]).options,
    ).toMatchObject({ checkAccount: 7, transaction: 8, yes: true });
    expect(parse('contacts:delete', ['42']).options.yes).toBe(false);
  });
  it('has no command-level --id or --file options left', () => {
    for (const module of Object.values(modules)) {
      expect(module.options?.schema.shape ?? {}).not.toHaveProperty('id');
      expect(module.options?.schema.shape ?? {}).not.toHaveProperty('file');
    }
  });
  it('uses the same ID validation for positional values and interactive answers', async () => {
    expect(idArgument.parse('42')).toBe(42);
    expect(
      await requireIdArgument({
        value: 42,
        requirement: 'an ID',
        question: 'ID?',
      }),
    ).toBe(42);
    expect(promptText).not.toHaveBeenCalled();
    vi.mocked(isInteractive).mockReturnValue(true);
    vi.mocked(promptText).mockResolvedValue(' 42 ');
    expect(
      await requireIdArgument({
        value: undefined,
        requirement: 'an ID',
        question: 'ID?',
      }),
    ).toBe(42);
    expect(promptText).toHaveBeenCalledWith('ID?');
  });
  it.each(['0', '-1', '1.5', 'NaN', 'Infinity', 'abc', '', '9007199254740992'])(
    'rejects invalid interactive IDs: %j',
    async (answer) => {
      vi.mocked(isInteractive).mockReturnValue(true);
      vi.mocked(promptText).mockResolvedValue(answer);
      await expect(
        requireIdArgument({
          value: undefined,
          requirement: 'an ID',
          question: 'ID?',
        }),
      ).rejects.toThrow();
    },
  );
  it('does not prompt for a missing ID in non-interactive mode', async () => {
    await expect(
      requireIdArgument({
        value: undefined,
        requirement: 'an ID as a positional argument',
        question: 'ID?',
      }),
    ).rejects.toThrow('process.exit(1)');
    expect(promptText).not.toHaveBeenCalled();
    expect(consola.error).toHaveBeenCalledWith(
      'You must provide an ID as a positional argument when running in a non-interactive environment.',
    );
  });
});
