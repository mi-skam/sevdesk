import { consola } from 'consola';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import creditNotesLayout from '../src/commands/credit-notes/layout';
import creditNotesPrint from '../src/commands/credit-notes/print';
import invoicesLayout from '../src/commands/invoices/layout';
import letterpapers from '../src/commands/layouts/letterpapers';
import templates from '../src/commands/layouts/templates';
import ordersLayout from '../src/commands/orders/layout';

const fetchMock = vi.fn();

function respondWith(...payloads: unknown[]): void {
  for (const payload of payloads) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
}

function request(index: number): { url: URL; init: RequestInit } {
  const call = fetchMock.mock.calls.at(index);
  if (!call) {
    throw new Error('No fetch call recorded.');
  }
  return { url: new URL(call[0] as string), init: call[1] as RequestInit };
}

function exitThrows(): void {
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as (code?: number) => never);
}

const changed = {
  objects: { result: '1', metadaten: { pdf: 'JVBERi0=', docId: 'd1' } },
};

describe('layout commands', () => {
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

  it('lists templates of a type and marks the default', async () => {
    respondWith({
      result: '1',
      templates: [
        { id: '2', name: 'Classic', type: 'Invoice', default: true },
        { id: '3', name: 'Modern', type: 'Invoice', default: 0 },
      ],
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await templates.action({ type: 'Invoice', json: false }, undefined);

    expect(request(0).url.pathname).toBe(
      '/api/v1/DocServer/getTemplatesWithThumb',
    );
    expect(request(0).url.searchParams.get('type')).toBe('Invoice');
    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('Classic');
    expect(output).toContain('yes');
  });

  it('lists letterpapers', async () => {
    respondWith({ result: '1', letterpapers: [] });
    const info = vi.spyOn(consola, 'info').mockImplementation(() => {});

    await letterpapers.action({ json: false }, undefined);

    expect(info).toHaveBeenCalledWith('No letterpapers found.');
  });

  it('changes template and language with one request each', async () => {
    respondWith(changed, changed);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await invoicesLayout.action(
      { template: '2', language: 'en_US', json: true },
      [3],
    );

    expect(request(0).url.pathname).toBe('/api/v1/Invoice/3/changeParameter');
    expect(JSON.parse(request(0).init.body as string)).toEqual({
      key: 'template',
      value: '2',
    });
    expect(JSON.parse(request(1).init.body as string)).toEqual({
      key: 'language',
      value: 'en_US',
    });
    // The re-rendered PDF is left out of the output.
    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toEqual([
      { key: 'template', value: '2', result: '1', docId: 'd1' },
      { key: 'language', value: 'en_US', result: '1', docId: 'd1' },
    ]);
  });

  it('uses the order and credit note endpoints', async () => {
    respondWith(changed, changed);
    const success = vi.spyOn(consola, 'success').mockImplementation(() => {});

    await ordersLayout.action({ letterpaper: '1', json: false }, [4]);
    await creditNotesLayout.action({ paypal: '1', json: false }, [5]);

    expect(request(0).url.pathname).toBe('/api/v1/Order/4/changeParameter');
    expect(request(1).url.pathname).toBe(
      '/api/v1/CreditNote/5/changeParameter',
    );
    expect(JSON.parse(request(1).init.body as string)).toEqual({
      key: 'payPal',
      value: '1',
    });
    expect(success).toHaveBeenLastCalledWith(
      'Changed payPal of credit note 5.',
    );
  });

  it('refuses a layout change without options', async () => {
    vi.spyOn(consola, 'error').mockImplementation(() => {});
    exitThrows();

    await expect(invoicesLayout.action({ json: false }, [3])).rejects.toThrow(
      'process.exit(1)',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('credit-notes:print', () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'sevdesk-print-'));
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('writes the PDF after confirmation via --yes', async () => {
      respondWith({
        objects: { pdf: Buffer.from('%PDF').toString('base64'), docId: 'd1' },
      });
      vi.spyOn(consola, 'success').mockImplementation(() => {});
      const output = join(dir, 'gs.pdf');

      await creditNotesPrint.action(
        { sendType: 'VPR', output, yes: true, json: false },
        [5],
      );

      expect(request(0).url.pathname).toBe(
        '/api/v1/CreditNote/5/sendByWithRender',
      );
      expect(request(0).url.searchParams.get('sendType')).toBe('VPR');
      expect(await readFile(output, 'utf8')).toBe('%PDF');
    });

    it('does nothing without --yes in a non-interactive environment', async () => {
      vi.spyOn(consola, 'error').mockImplementation(() => {});
      exitThrows();

      await expect(
        creditNotesPrint.action(
          { sendType: 'VPR', yes: false, json: false },
          [5],
        ),
      ).rejects.toThrow('process.exit(1)');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
