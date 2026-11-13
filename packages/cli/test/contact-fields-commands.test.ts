import { consola } from 'consola';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import settingsCreate from '../src/commands/contact-field-settings/create';
import settingsDelete from '../src/commands/contact-field-settings/delete';
import settingsList from '../src/commands/contact-field-settings/list';
import settingsUpdate from '../src/commands/contact-field-settings/update';
import settingsUsage from '../src/commands/contact-field-settings/usage';
import fieldsCreate from '../src/commands/contact-fields/create';
import fieldsDelete from '../src/commands/contact-fields/delete';
import fieldsList from '../src/commands/contact-fields/list';
import fieldsUpdate from '../src/commands/contact-fields/update';
import placeholdersList from '../src/commands/placeholders/list';

const setting = {
  id: '2',
  objectName: 'ContactCustomFieldSetting',
  create: '2026-01-01T10:00:00+01:00',
  update: '2026-01-01T10:00:00+01:00',
  name: 'Tier',
  identifier: 'tier',
  description: null,
};

const field = {
  id: '5',
  objectName: 'ContactCustomField',
  create: '2026-01-01T10:00:00+01:00',
  update: '2026-01-01T10:00:00+01:00',
  contact: { id: '7', objectName: 'Contact' },
  contactCustomFieldSetting: setting,
  value: 'Gold',
};

const fetchMock = vi.fn();

function jsonResponse(objects: unknown): Response {
  return new Response(JSON.stringify({ objects }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function respondWith(...pages: unknown[]): void {
  for (const page of pages) {
    fetchMock.mockResolvedValueOnce(jsonResponse(page));
  }
  fetchMock.mockImplementation(async () => jsonResponse([]));
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

describe('contact field commands', () => {
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

  it('lists the fields of a contact with the definition name', async () => {
    respondWith([field]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await fieldsList.action(
      { contact: 7, json: false, local: false },
      undefined,
    );

    const { url } = request(0);
    expect(url.pathname).toBe('/api/v1/ContactCustomField');
    expect(url.searchParams.get('contact[id]')).toBe('7');
    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('Tier');
    expect(output).toContain('Gold');
  });

  it('sets a field of a contact', async () => {
    respondWith(field);
    const success = vi.spyOn(consola, 'success').mockImplementation(() => {});

    await fieldsCreate.action(
      { contact: 7, setting: 2, value: 'Gold', json: false },
      undefined,
    );

    const { url, init } = request(-1);
    expect(init.method).toBe('POST');
    expect(url.pathname).toBe('/api/v1/ContactCustomField');
    expect(JSON.parse(init.body as string)).toMatchObject({
      contact: { id: 7, objectName: 'Contact' },
      contactCustomFieldSetting: { id: 2 },
      value: 'Gold',
    });
    expect(success).toHaveBeenCalledWith('Created contact field 5.');
  });

  it('changes a value', async () => {
    respondWith(field);
    vi.spyOn(consola, 'success').mockImplementation(() => {});

    await fieldsUpdate.action({ value: 'Silver', json: false }, [5]);

    const { url, init } = request(-1);
    expect(init.method).toBe('PUT');
    expect(url.pathname).toBe('/api/v1/ContactCustomField/5');
    expect(JSON.parse(init.body as string)).toEqual({
      objectName: 'ContactCustomField',
      mapAll: true,
      value: 'Silver',
    });
  });

  it('deletes a value when confirmed via --yes', async () => {
    respondWith([null]);
    vi.spyOn(consola, 'success').mockImplementation(() => {});

    await fieldsDelete.action({ yes: true, json: false }, [5]);

    expect(request(-1).init.method).toBe('DELETE');
    expect(request(-1).url.pathname).toBe('/api/v1/ContactCustomField/5');
  });

  it('lists definitions', async () => {
    respondWith([setting]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await settingsList.action({ json: false, local: false }, undefined);

    expect(request(0).url.pathname).toBe('/api/v1/ContactCustomFieldSetting');
    expect(log.mock.calls.flat().join('\n')).toContain('tier');
  });

  it('creates and renames a definition', async () => {
    respondWith(setting, setting);
    vi.spyOn(consola, 'success').mockImplementation(() => {});

    await settingsCreate.action({ name: 'Tier', json: false }, undefined);
    expect(request(0).init.method).toBe('POST');
    expect(JSON.parse(request(0).init.body as string)).toEqual({
      objectName: 'ContactCustomFieldSetting',
      mapAll: true,
      name: 'Tier',
    });

    await settingsUpdate.action({ name: 'Level', json: false }, [2]);
    expect(request(1).init.method).toBe('PUT');
    expect(request(1).url.pathname).toBe('/api/v1/ContactCustomFieldSetting/2');
  });

  it('refuses an update without changes', async () => {
    vi.spyOn(consola, 'error').mockImplementation(() => {});
    exitThrows();

    await expect(settingsUpdate.action({ json: false }, [2])).rejects.toThrow(
      'process.exit(1)',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('counts the uses of a definition', async () => {
    respondWith(3);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await settingsUsage.action({ json: true }, [2]);

    expect(request(0).url.pathname).toBe(
      '/api/v1/ContactCustomFieldSetting/2/getReferenceCount',
    );
    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toEqual({
      references: 3,
    });
  });

  it('names the number of uses before deleting a definition', async () => {
    respondWith(3);
    vi.spyOn(consola, 'error').mockImplementation(() => {});
    exitThrows();

    await expect(
      settingsDelete.action({ yes: false, json: false }, [2]),
    ).rejects.toThrow('process.exit(1)');
    // Only the reference count was read; nothing was deleted.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    respondWith(3, [null]);
    vi.spyOn(consola, 'success').mockImplementation(() => {});
    await settingsDelete.action({ yes: true, json: false }, [2]);
    expect(request(-1).init.method).toBe('DELETE');
  });

  it('lists placeholders as a flat table', async () => {
    respondWith([
      {
        key: 'Contact',
        value: [{ key: '[%KUNDENNUMMER%]', value: 'Customer number' }],
      },
    ]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await placeholdersList.action(
      { objectType: 'Invoice', json: false },
      undefined,
    );

    expect(request(0).url.searchParams.get('objectName')).toBe('Invoice');
    expect(log.mock.calls.flat().join('\n')).toContain('[%KUNDENNUMMER%]');
  });
});
