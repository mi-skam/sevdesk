import type { vi } from 'vitest';
import { describe, expect, it } from 'vitest';
import { SevDeskError } from '../src/errors';
import { AccountingContactsResource } from '../src/resources/accounting-contacts';
import { createHttpClient, createMockFetch, lastRequest } from './helpers';

const BASE_URL = 'https://my.sevdesk.de/api/v1';

function createResource(
  fetch: typeof globalThis.fetch,
): AccountingContactsResource {
  return new AccountingContactsResource(createHttpClient(fetch));
}

function parsedBody(fetch: ReturnType<typeof vi.fn>): unknown {
  return JSON.parse(lastRequest(fetch).init.body as string) as unknown;
}

describe('AccountingContactsResource', () => {
  it('lists accounting contacts without filters', async () => {
    const fetch = createMockFetch({ objects: [] });

    await createResource(fetch).list();

    const { url, init } = lastRequest(fetch);
    expect(url).toBe(`${BASE_URL}/AccountingContact`);
    expect(init.method).toBe('GET');
  });

  it('filters by contact and pages', async () => {
    const fetch = createMockFetch({ objects: [] });

    await createResource(fetch).list({ contactId: 7, limit: 10, offset: 20 });

    expect(decodeURIComponent(lastRequest(fetch).url)).toBe(
      `${BASE_URL}/AccountingContact?contact[id]=7&contact[objectName]=Contact&limit=10&offset=20`,
    );
  });

  it('embeds related objects', async () => {
    const fetch = createMockFetch({ objects: [{ id: '3' }] });

    await createResource(fetch).list({ embed: ['contact'] });
    expect(lastRequest(fetch).url).toBe(
      `${BASE_URL}/AccountingContact?embed=contact`,
    );

    await createResource(fetch).get({
      accountingContactId: 3,
      embed: ['contact'],
    });
    expect(lastRequest(fetch).url).toBe(
      `${BASE_URL}/AccountingContact/3?embed=contact`,
    );
  });

  it('unwraps a single accounting contact', async () => {
    const fetch = createMockFetch({ objects: [{ id: '3' }] });

    const accountingContact = await createResource(fetch).get({
      accountingContactId: 3,
    });

    expect(accountingContact).toEqual({ id: '3' });
    expect(lastRequest(fetch).url).toBe(`${BASE_URL}/AccountingContact/3`);
  });

  it('throws a 404 error when the array is empty', async () => {
    const fetch = createMockFetch({ objects: [] });

    await expect(
      createResource(fetch).get({ accountingContactId: 3 }),
    ).rejects.toThrow(SevDeskError);
  });

  it('creates an accounting contact for a contact', async () => {
    const fetch = createMockFetch({ objects: { id: '3' } });

    await createResource(fetch).create({ contactId: 7, debitorNumber: 10001 });

    expect(lastRequest(fetch).init.method).toBe('POST');
    expect(lastRequest(fetch).url).toBe(`${BASE_URL}/AccountingContact`);
    expect(parsedBody(fetch)).toEqual({
      objectName: 'AccountingContact',
      mapAll: true,
      contact: { id: 7, objectName: 'Contact' },
      debitorNumber: 10001,
    });
  });

  it('updates only the given numbers', async () => {
    const fetch = createMockFetch({ objects: { id: '3' } });

    await createResource(fetch).update({
      accountingContactId: 3,
      creditorNumber: 70001,
    });

    expect(lastRequest(fetch).init.method).toBe('PUT');
    expect(lastRequest(fetch).url).toBe(`${BASE_URL}/AccountingContact/3`);
    expect(parsedBody(fetch)).toEqual({
      objectName: 'AccountingContact',
      mapAll: true,
      creditorNumber: 70001,
    });
  });

  it('deletes an accounting contact', async () => {
    const fetch = createMockFetch({ objects: [null] });

    await createResource(fetch).delete({ accountingContactId: 3 });

    expect(lastRequest(fetch).init.method).toBe('DELETE');
    expect(lastRequest(fetch).url).toBe(`${BASE_URL}/AccountingContact/3`);
  });
});
