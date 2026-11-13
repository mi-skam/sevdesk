import { consola } from 'consola';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { commands } from '../src/commands';
import {
  buildTools,
  pagingHint,
  shapeOutput,
  toolKind,
  type Command,
} from '../src/mcp/tools';

const fetchMock = vi.fn();

function jsonResponse(objects: unknown): Response {
  return new Response(JSON.stringify({ objects }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function text(result: { content: Array<{ text: string }> }): string {
  return result.content.map((part) => part.text).join('\n');
}

function tool(all: Record<string, Command>, name: string, allowWrites = false) {
  const found = buildTools(all, { allowWrites }).find((t) => t.name === name);
  if (!found) {
    throw new Error(`No tool ${name}`);
  }
  return found;
}

describe('MCP tools from the CLI commands', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubEnv('SEVDESK_TOKEN', 'test-token');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('offers only reads by default', () => {
    const names = buildTools(commands, { allowWrites: false }).map(
      (t) => t.annotations?.title,
    );
    expect(names).toContain('vouchers:list');
    expect(names).toContain('db:sync');
    expect(names).not.toContain('vouchers:create');
    for (const name of names) {
      expect(toolKind(name!)).not.toBe('draft-write');
    }
  });

  it('never offers booking, sending, deleting or file output', () => {
    const names = buildTools(commands, { allowWrites: true }).map(
      (t) => t.annotations?.title ?? '',
    );
    expect(names).toContain('vouchers:create');
    expect(names).toContain('contacts:create');
    for (const name of names) {
      const [group, action = ''] = name.split(':');
      expect(group).not.toMatch(/^(export|login|logout|mcp)$/);
      expect(action).not.toMatch(
        /delete|book|enshrine|reset|send|print|pdf|document|layout|update|open/,
      );
    }
  });

  it('names tools without colons and marks reads read-only', () => {
    for (const t of buildTools(commands, { allowWrites: true })) {
      expect(t.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(t.inputSchema['type']).toBe('object');
      expect(t.annotations?.readOnlyHint).toBe(
        toolKind(t.annotations!.title!) === 'read',
      );
      expect(t.description).not.toContain('you will be prompted');
    }
  });

  it('requires the ID the CLI would prompt for and hides json and yes', () => {
    const contactsGet = tool(commands, 'contacts_get');
    expect(contactsGet.inputSchema['required']).toEqual(['id']);
    const properties = contactsGet.inputSchema['properties'] as object;
    expect(Object.keys(properties)).toEqual(['id', 'local']);

    const create = tool(commands, 'vouchers_create', true);
    const createProperties = Object.keys(
      create.inputSchema['properties'] as object,
    );
    expect(createProperties).toContain('file');
    expect(createProperties).not.toContain('status');
    expect(createProperties).not.toContain('json');
  });

  it('returns the JSON output of the command', async () => {
    fetchMock.mockImplementation(async (input: string) =>
      jsonResponse(
        new URL(input).pathname === '/api/v1/Contact/7'
          ? [{ id: '7', objectName: 'Contact', name: 'ACME GmbH' }]
          : [],
      ),
    );

    const result = await tool(commands, 'contacts_get').call({ id: 7 });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(text(result))).toMatchObject({
      contact: { id: '7', name: 'ACME GmbH' },
    });
    expect(new URL(fetchMock.mock.calls[0]![0] as string).pathname).toBe(
      '/api/v1/Contact/7',
    );
  });

  it('reports a missing argument without running the command', async () => {
    const result = await tool(commands, 'contacts_get').call({});
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Missing required argument: id.' }],
      isError: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates vouchers as drafts only', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'sevdesk-mcp-')), 'r.pdf');
    await writeFile(file, 'receipt content');
    fetchMock
      .mockImplementationOnce(async () =>
        jsonResponse({ filename: 'tmp-1.pdf', pages: 1 }),
      )
      .mockImplementationOnce(async () =>
        jsonResponse({
          voucher: { id: '42', objectName: 'Voucher', status: '50' },
          voucherPos: [],
        }),
      );

    const result = await tool(commands, 'vouchers_create', true).call({
      file,
      taxRule: 9,
      accountDatev: 1600,
      amount: 119,
      taxRate: 19,
      supplierName: 'ACME GmbH',
      status: 'open',
    });

    expect(result.isError).toBeUndefined();
    const save = fetchMock.mock.calls[1]!;
    expect(String(save[0])).toContain('/Voucher/Factory/saveVoucher');
    expect(
      JSON.parse((save[1] as RequestInit).body as string).voucher.status,
    ).toBe(50);
  });

  it('reports API errors as tool errors', async () => {
    fetchMock.mockImplementation(async () => jsonResponse([]));
    const result = await tool(commands, 'contacts_get').call({ id: 7 });
    expect(result.isError).toBe(true);
  });
});

describe('command capture', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const fake = (
    action: Command['action'],
    extra = {},
  ): Record<string, Command> => ({
    'fake:list': defineCommand({
      description: 'A fake list.',
      options: defineOptions(
        z.object({
          status: z.string().default('open'),
          json: z.boolean().default(false),
          ...extra,
        }),
      ),
      action: action as never,
    }) as Command,
  });

  it('passes json and collects console and consola output', async () => {
    const seen = vi.fn();
    const all = fake(((options: unknown) => {
      seen(options);
      console.log('{"ok":true}');
      consola.warn('Record 3 was deleted in sevdesk.');
    }) as Command['action']);

    const result = await tool(all, 'fake_list').call({});

    expect(seen).toHaveBeenCalledWith({ status: 'open', json: true });
    expect(result.content.map((part) => part.text)).toEqual([
      '{"ok":true}',
      'Record 3 was deleted in sevdesk.',
    ]);
    expect(result.isError).toBeUndefined();
  });

  it('turns process.exit into a failed call and keeps the process alive', async () => {
    const all = fake((() => {
      consola.error('You must pass --yes.');
      process.exit(1);
    }) as Command['action']);
    const exit = process.exit;

    const result = await tool(all, 'fake_list').call({});

    expect(result).toEqual({
      content: [{ type: 'text', text: 'You must pass --yes.' }],
      isError: true,
    });
    expect(process.exit).toBe(exit);
  });

  it('reports a thrown error and restores console.log', async () => {
    const log = console.log;
    const all = fake((() => {
      throw new Error('Boom');
    }) as Command['action']);

    const result = await tool(all, 'fake_list').call({});

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Boom');
    expect(console.log).toBe(log);
  });

  it('fails when the command sets a non-zero exit code', async () => {
    const all = fake((() => {
      process.exitCode = 1;
    }) as Command['action']);
    const result = await tool(all, 'fake_list').call({});
    expect(result.isError).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });
});

describe('shapeOutput', () => {
  it('compacts JSON and drops omitted fields', () => {
    const text = JSON.stringify(
      [{ id: '1', img: 'AAAA', name: 'ACME' }],
      null,
      2,
    );
    expect(shapeOutput(text, ['img'])).toEqual({
      text: '[{"id":"1","name":"ACME"}]',
    });
  });

  it('cuts a long list to the records that fit, with a hint', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }));
    const shaped = shapeOutput(JSON.stringify(records), [], 50, 'Page.');
    const kept = JSON.parse(shaped.text) as unknown[];
    expect(shaped.text.length).toBeLessThanOrEqual(50);
    expect(kept).toEqual(records.slice(0, kept.length));
    expect(shaped.note).toBe(
      `Showing the first ${kept.length} of 10 records; the rest did not fit into one result. Page.`,
    );
  });

  it('cuts text and objects that are too long', () => {
    expect(shapeOutput('x'.repeat(20), [], 10)).toEqual({
      text: 'x'.repeat(10),
      note: 'Output cut at 10 of 20 characters.',
    });
    expect(
      shapeOutput(JSON.stringify({ a: 'y'.repeat(20) }), [], 10).note,
    ).toBe('Output cut at 10 of 28 characters.');
  });
});

describe('pagingHint', () => {
  it('names the way to reach the rest', () => {
    expect(pagingHint(['status', 'limit', 'offset', 'local'])).toBe(
      'Page with limit and offset, or narrow the query with filters.',
    );
    expect(pagingHint(['accountNumber', 'taxRule'])).toBe(
      'Narrow the query with accountNumber, taxRule.',
    );
    expect(pagingHint([])).toBe(
      'This tool cannot page; the result is incomplete.',
    );
  });
});
