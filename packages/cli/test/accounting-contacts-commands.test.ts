import { consola } from 'consola';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import create from '../src/commands/accounting-contacts/create';
import remove from '../src/commands/accounting-contacts/delete';
import get from '../src/commands/accounting-contacts/get';
import list from '../src/commands/accounting-contacts/list';
import update from '../src/commands/accounting-contacts/update';

const accountingContact = {
  id: '3',
  objectName: 'AccountingContact',
  create: '2026-01-01T10:00:00+01:00',
  update: '2026-01-01T10:00:00+01:00',
  contact: { id: '7', objectName: 'Contact' },
  sevClient: { id: '1', objectName: 'SevClient' },
  debitorNumber: '10001',
  creditorNumber: null,
};

const fetchMock = vi.fn();

function jsonResponse(objects: unknown): Response {
  return new Response(JSON.stringify({ objects }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Serves one page followed by empty ones, so paginated commands terminate. */
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

function exitThrows(): void {
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as (code?: number) => never);
}

describe('accounting contact commands', () => {
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

  it('lists the accounting contacts of a contact', async () => {
    respondWith([accountingContact]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await list.action({ contact: 7, json: false, local: false }, undefined);

    const { url, init } = request();
    expect(init.method).toBe('GET');
    expect(url.pathname).toBe('/api/v1/AccountingContact');
    expect(url.searchParams.get('contact[id]')).toBe('7');
    expect(url.searchParams.get('contact[objectName]')).toBe('Contact');
    expect(url.searchParams.get('embed')).toBe('contact');
    expect(log.mock.calls.flat().join('\n')).toContain('10001');
  });

  it('shows contact names, falling back to the bare name', async () => {
    respondWith([
      {
        ...accountingContact,
        contact: { id: '7', objectName: 'Contact', name: 'ACME GmbH' },
      },
      {
        ...accountingContact,
        id: '4',
        contact: {
          id: '8',
          objectName: 'Contact',
          name: null,
          surename: 'Erika',
          familyname: 'Mustermann',
        },
      },
      {
        ...accountingContact,
        id: '5',
        contact: undefined,
        contactName: 'ACME Coffee',
        debitorNumber: null,
        creditorNumber: '70000',
      },
    ]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await list.action({ json: false, local: false }, undefined);

    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('ACME GmbH');
    expect(output).toContain('Erika Mustermann');
    expect(output).toContain('ACME Coffee');
  });

  it('reports an empty list', async () => {
    respondWith([]);
    const info = vi.spyOn(consola, 'info').mockImplementation(() => {});

    await list.action({ json: false, local: false }, undefined);

    expect(info).toHaveBeenCalledWith('No accounting contacts found.');
  });

  it('shows one accounting contact as JSON', async () => {
    respondWith([accountingContact]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await get.action({ json: true, local: false }, [3]);

    expect(request().url.pathname).toBe('/api/v1/AccountingContact/3');
    expect(request().url.searchParams.get('embed')).toBe('contact');
    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toEqual(
      accountingContact,
    );
  });

  it('creates an accounting contact', async () => {
    respondWith(accountingContact);
    const success = vi.spyOn(consola, 'success').mockImplementation(() => {});

    await create.action(
      { contact: 7, debitorNumber: 10001, json: false },
      undefined,
    );

    const { url, init } = request(-1);
    expect(init.method).toBe('POST');
    expect(url.pathname).toBe('/api/v1/AccountingContact');
    expect(JSON.parse(init.body as string)).toEqual({
      objectName: 'AccountingContact',
      mapAll: true,
      contact: { id: 7, objectName: 'Contact' },
      debitorNumber: 10001,
    });
    expect(success).toHaveBeenCalledWith('Created accounting contact 3.');
  });

  it('updates a number when confirmed via --yes', async () => {
    respondWith(accountingContact);
    vi.spyOn(consola, 'success').mockImplementation(() => {});

    await update.action({ creditorNumber: 70001, yes: true, json: false }, [3]);

    const { url, init } = request(-1);
    expect(init.method).toBe('PUT');
    expect(url.pathname).toBe('/api/v1/AccountingContact/3');
    expect(JSON.parse(init.body as string)).toEqual({
      objectName: 'AccountingContact',
      mapAll: true,
      creditorNumber: 70001,
    });
  });

  it('refuses an update without a number', async () => {
    const error = vi.spyOn(consola, 'error').mockImplementation(() => {});
    exitThrows();

    await expect(
      update.action({ yes: true, json: false }, [3]),
    ).rejects.toThrow('process.exit(1)');
    expect(error).toHaveBeenCalledWith(
      'You must provide at least one of --debitor-number or --creditor-number.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deletes when confirmed via --yes', async () => {
    respondWith([null]);
    const success = vi.spyOn(consola, 'success').mockImplementation(() => {});

    await remove.action({ yes: true, json: false }, [3]);

    const { url, init } = request(-1);
    expect(init.method).toBe('DELETE');
    expect(url.pathname).toBe('/api/v1/AccountingContact/3');
    expect(success).toHaveBeenCalledWith('Accounting contact deleted.');
  });

  it('does not delete without --yes in a non-interactive environment', async () => {
    vi.spyOn(consola, 'error').mockImplementation(() => {});
    exitThrows();

    await expect(
      remove.action({ yes: false, json: false }, [3]),
    ).rejects.toThrow('process.exit(1)');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
