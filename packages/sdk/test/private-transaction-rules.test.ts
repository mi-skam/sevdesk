import { describe, expect, it } from 'vitest';
import { PrivateTransactionRulesResource } from '../src/resources/private-transaction-rules';
import { createHttpClient, createMockFetch, lastRequest } from './helpers';

const BASE_URL = 'https://my.sevdesk.de/api/v1';

function createResource(
  fetch: typeof globalThis.fetch,
): PrivateTransactionRulesResource {
  return new PrivateTransactionRulesResource(createHttpClient(fetch));
}

describe('PrivateTransactionRulesResource', () => {
  it('lists rules with pagination', async () => {
    const fetch = createMockFetch({ objects: [] });

    await createResource(fetch).list({ limit: 10, offset: 20 });

    const { url, init } = lastRequest(fetch);
    expect(url).toBe(`${BASE_URL}/PrivateTransactionRule?limit=10&offset=20`);
    expect(init.method).toBe('GET');
  });

  it('creates a rule', async () => {
    const fetch = createMockFetch({ objects: { id: '4' } });

    const rule = await createResource(fetch).create({
      counterpartName: 'ACME Coffee',
    });

    expect(rule).toEqual({ id: '4' });
    const { url, init } = lastRequest(fetch);
    expect(url).toBe(`${BASE_URL}/PrivateTransactionRule`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      objectName: 'PrivateTransactionRule',
      counterpartName: 'ACME Coffee',
    });
  });

  it('deletes a rule', async () => {
    const fetch = createMockFetch({ objects: [null] });

    await createResource(fetch).delete({ ruleId: 4 });

    const { url, init } = lastRequest(fetch);
    expect(url).toBe(`${BASE_URL}/PrivateTransactionRule/4`);
    expect(init.method).toBe('DELETE');
  });
});
