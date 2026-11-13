import type { vi } from 'vitest';
import { describe, expect, it } from 'vitest';
import { SevDeskError } from '../src/errors';
import {
  ContactCustomFieldSettingsResource,
  ContactCustomFieldsResource,
} from '../src/resources/contact-custom-fields';
import { createHttpClient, createMockFetch, lastRequest } from './helpers';

const BASE_URL = 'https://my.sevdesk.de/api/v1';

function body(fetch: ReturnType<typeof vi.fn>): unknown {
  return JSON.parse(lastRequest(fetch).init.body as string) as unknown;
}

describe('ContactCustomFieldsResource', () => {
  const fields = (fetch: typeof globalThis.fetch) =>
    new ContactCustomFieldsResource(createHttpClient(fetch));

  it('lists the fields of a contact', async () => {
    const fetch = createMockFetch({ objects: [] });

    await fields(fetch).list({ contactId: 7, limit: 10, offset: 20 });

    expect(decodeURIComponent(lastRequest(fetch).url)).toBe(
      `${BASE_URL}/ContactCustomField?contact[id]=7&contact[objectName]=Contact&limit=10&offset=20`,
    );
  });

  it('gets one field and throws 404 for an empty array', async () => {
    const fetch = createMockFetch({ objects: [{ id: '5' }] });
    await expect(
      fields(fetch).get({ contactCustomFieldId: 5 }),
    ).resolves.toEqual({ id: '5' });
    expect(lastRequest(fetch).url).toBe(`${BASE_URL}/ContactCustomField/5`);

    const empty = createMockFetch({ objects: [] });
    await expect(
      fields(empty).get({ contactCustomFieldId: 5 }),
    ).rejects.toThrow(SevDeskError);
  });

  it('creates a field value with both references', async () => {
    const fetch = createMockFetch({ objects: { id: '5' } });

    const field = await fields(fetch).create({
      contactId: 7,
      settingId: 2,
      value: 'Gold',
    });

    expect(field).toEqual({ id: '5' });
    expect(lastRequest(fetch).init.method).toBe('POST');
    expect(body(fetch)).toEqual({
      objectName: 'ContactCustomField',
      mapAll: true,
      contact: { id: 7, objectName: 'Contact' },
      contactCustomFieldSetting: {
        id: 2,
        objectName: 'ContactCustomFieldSetting',
      },
      value: 'Gold',
    });
  });

  it('accepts a single result wrapped in an array', async () => {
    const fetch = createMockFetch({ objects: [{ id: '5' }] });

    await expect(
      fields(fetch).update({ contactCustomFieldId: 5, value: 'Silver' }),
    ).resolves.toEqual({ id: '5' });
    expect(lastRequest(fetch).init.method).toBe('PUT');
    expect(body(fetch)).toEqual({
      objectName: 'ContactCustomField',
      mapAll: true,
      value: 'Silver',
    });
  });

  it('deletes a field value', async () => {
    const fetch = createMockFetch({ objects: [null] });

    await fields(fetch).delete({ contactCustomFieldId: 5 });

    expect(lastRequest(fetch).init.method).toBe('DELETE');
    expect(lastRequest(fetch).url).toBe(`${BASE_URL}/ContactCustomField/5`);
  });
});

describe('ContactCustomFieldSettingsResource', () => {
  const settings = (fetch: typeof globalThis.fetch) =>
    new ContactCustomFieldSettingsResource(createHttpClient(fetch));

  it('lists definitions with pagination', async () => {
    const fetch = createMockFetch({ objects: [] });

    await settings(fetch).list({ limit: 10 });

    expect(lastRequest(fetch).url).toBe(
      `${BASE_URL}/ContactCustomFieldSetting?limit=10`,
    );
  });

  it('gets one definition', async () => {
    const fetch = createMockFetch({ objects: [{ id: '2' }] });

    await expect(
      settings(fetch).get({ contactCustomFieldSettingId: 2 }),
    ).resolves.toEqual({ id: '2' });
    expect(lastRequest(fetch).url).toBe(
      `${BASE_URL}/ContactCustomFieldSetting/2`,
    );
  });

  it('creates and updates definitions', async () => {
    const fetch = createMockFetch({ objects: [{ id: '2' }] });

    await settings(fetch).create({ name: 'Tier', description: 'Loyalty' });
    expect(lastRequest(fetch).init.method).toBe('POST');
    expect(body(fetch)).toEqual({
      objectName: 'ContactCustomFieldSetting',
      mapAll: true,
      name: 'Tier',
      description: 'Loyalty',
    });

    await settings(fetch).update({
      contactCustomFieldSettingId: 2,
      name: 'Level',
    });
    expect(lastRequest(fetch).init.method).toBe('PUT');
    expect(lastRequest(fetch).url).toBe(
      `${BASE_URL}/ContactCustomFieldSetting/2`,
    );
    expect(body(fetch)).toEqual({
      objectName: 'ContactCustomFieldSetting',
      mapAll: true,
      name: 'Level',
    });
  });

  it('deletes a definition and counts its references', async () => {
    const deleted = createMockFetch({ objects: [null] });
    await settings(deleted).delete({ contactCustomFieldSettingId: 2 });
    expect(lastRequest(deleted).init.method).toBe('DELETE');

    const count = createMockFetch({ objects: 3 });
    await expect(
      settings(count).referenceCount({ contactCustomFieldSettingId: 2 }),
    ).resolves.toBe(3);
    expect(lastRequest(count).url).toBe(
      `${BASE_URL}/ContactCustomFieldSetting/2/getReferenceCount`,
    );
  });
});
