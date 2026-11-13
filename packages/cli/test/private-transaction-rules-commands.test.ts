import { consola } from 'consola';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import create from '../src/commands/private-transaction-rules/create';
import remove from '../src/commands/private-transaction-rules/delete';
import list from '../src/commands/private-transaction-rules/list';

const rule = {
  id: '4',
  objectName: 'PrivateTransactionRule',
  create: '2026-01-01T10:00:00+01:00',
  update: '2026-01-01T10:00:00+01:00',
  sevClient: { id: '1', objectName: 'SevClient' },
  paymentPurpose: null,
  counterpartName: 'ACME Coffee',
};

const fetchMock = vi.fn();

function jsonResponse(objects: unknown): Response {
  return new Response(JSON.stringify({ objects }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function respondWith(objects: unknown): void {
  fetchMock
    .mockResolvedValueOnce(jsonResponse(objects))
    .mockImplementation(async () => jsonResponse([]));
}

function request(index = 0): { url: URL; init: RequestInit } {
  const call = fetchMock.mock.calls.at(index);
  if (!call) {
    throw new Error('No fetch call recorded.');
  }
  return { url: new URL(call[0] as string), init: call[1] as RequestInit };
}

describe('private transaction rule commands', () => {
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

  it('lists rules', async () => {
    respondWith([rule]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await list.action({ json: false, local: false }, undefined);

    expect(request().url.pathname).toBe('/api/v1/PrivateTransactionRule');
    expect(log.mock.calls.flat().join('\n')).toContain('ACME Coffee');
  });

  it('creates a rule', async () => {
    respondWith(rule);
    const success = vi.spyOn(consola, 'success').mockImplementation(() => {});

    await create.action({ counterpart: 'ACME Coffee', json: false }, undefined);

    const { url, init } = request(-1);
    expect(init.method).toBe('POST');
    expect(url.pathname).toBe('/api/v1/PrivateTransactionRule');
    expect(JSON.parse(init.body as string)).toEqual({
      objectName: 'PrivateTransactionRule',
      counterpartName: 'ACME Coffee',
    });
    expect(success).toHaveBeenCalledWith('Created private transaction rule 4.');
  });

  it('refuses a rule without criteria', async () => {
    const error = vi.spyOn(consola, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as (code?: number) => never);

    await expect(create.action({ json: false }, undefined)).rejects.toThrow(
      'process.exit(1)',
    );
    expect(error).toHaveBeenCalledWith(
      'You must provide --counterpart, --purpose or both.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deletes a rule when confirmed via --yes', async () => {
    respondWith([null]);
    vi.spyOn(consola, 'success').mockImplementation(() => {});

    await remove.action({ yes: true, json: false }, [4]);

    const { url, init } = request(-1);
    expect(init.method).toBe('DELETE');
    expect(url.pathname).toBe('/api/v1/PrivateTransactionRule/4');
  });
});
