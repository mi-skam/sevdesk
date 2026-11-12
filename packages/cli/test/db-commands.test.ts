import { consola } from 'consola';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import info from '../src/commands/db/info';
import sync from '../src/commands/db/sync';
import { ENTITIES } from '../src/sync';

const voucher = {
  id: '1',
  objectName: 'Voucher',
  create: '2026-01-01T10:00:00+01:00',
  update: '2026-01-02T10:00:00+01:00',
  description: 'RE-1',
  supplier: { id: '7', objectName: 'Contact', name: 'ACME GmbH' },
};

const tag = { id: '3', objectName: 'Tag', name: 'ACME' };

const fetchMock = vi.fn();
let dir: string;

function jsonResponse(objects: unknown): Response {
  return new Response(JSON.stringify({ objects }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Serves one record per endpoint on the first page and empty pages after. */
function serve(rows: Record<string, unknown[]>): void {
  fetchMock.mockImplementation(async (input: string) => {
    const url = new URL(input);
    const resource = url.pathname.replace('/api/v1/', '');
    const offset = Number(url.searchParams.get('offset') ?? '0');
    return jsonResponse(offset === 0 ? (rows[resource] ?? []) : []);
  });
}

function requestedUrls(): URL[] {
  return fetchMock.mock.calls.map((call) => new URL(call[0] as string));
}

describe('db commands', () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sevdesk-db-'));
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

  it('syncs every entity and reports the result as JSON', async () => {
    serve({ Voucher: [voucher], Tag: [tag] });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sync.action({ full: false, json: true }, undefined);

    const output = JSON.parse(log.mock.calls[0]?.[0] as string) as {
      path: string;
      entities: Array<{ entity: string; mode: string; inserted: number }>;
      skipped: string[];
      requests: number;
    };
    expect(output.path).toBe(join(dir, 'sevdesk.db'));
    expect(output.entities.map((e) => e.entity)).toEqual(
      ENTITIES.map((e) => e.name),
    );
    expect(output.entities.find((e) => e.entity === 'vouchers')).toMatchObject({
      mode: 'full',
      inserted: 1,
    });
    expect(output.skipped).toEqual([]);
    // Every request is a read.
    expect(
      fetchMock.mock.calls.every(
        (call) => (call[1] as RequestInit).method === 'GET',
      ),
    ).toBe(true);
    const voucherRequest = requestedUrls().find(
      (url) => url.pathname === '/api/v1/Voucher',
    );
    expect(voucherRequest?.searchParams.get('embed')).toBe('supplier');
    expect(voucherRequest?.searchParams.has('updateAfter')).toBe(false);
  });

  it('sends updateAfter on the second sync', async () => {
    serve({ Voucher: [voucher] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await sync.action({ full: false, json: true }, undefined);
    fetchMock.mockClear();

    await sync.action({ full: false, json: true }, undefined);

    const voucherRequest = requestedUrls().find(
      (url) => url.pathname === '/api/v1/Voucher',
    );
    // Watermark 2026-01-02T09:00:00Z minus one hour.
    expect(voucherRequest?.searchParams.get('updateAfter')).toBe(
      String(Date.parse('2026-01-02T08:00:00Z') / 1000),
    );
  });

  it('prints a table and the database path', async () => {
    serve({ Voucher: [voucher] });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const success = vi.spyOn(consola, 'success').mockImplementation(() => {});
    const infoLog = vi.spyOn(consola, 'info').mockImplementation(() => {});

    await sync.action({ full: false, json: false }, undefined);

    expect(log.mock.calls.flat().join('\n')).toContain('vouchers');
    expect(success.mock.calls[0]?.[0]).toMatch(/^Synced with \d+ requests\.$/);
    expect(infoLog).toHaveBeenCalledWith(
      `Database: ${join(dir, 'sevdesk.db')}`,
    );
  });

  it('fails db:info without a database', async () => {
    await expect(info.action({ json: true }, undefined)).rejects.toThrow(
      'Run `sevdesk db:sync` first.',
    );
  });

  it('shows counts per entity after a sync', async () => {
    serve({ Voucher: [voucher], Tag: [tag] });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sync.action({ full: false, json: true }, undefined);
    log.mockClear();

    await info.action({ json: true }, undefined);

    const output = JSON.parse(log.mock.calls[0]?.[0] as string) as {
      entities: Array<{ entity: string; records: number }>;
    };
    expect(output.entities).toHaveLength(ENTITIES.length);
    expect(output.entities.find((e) => e.entity === 'vouchers')?.records).toBe(
      1,
    );
    expect(output.entities.find((e) => e.entity === 'tags')?.records).toBe(1);
  });
});
