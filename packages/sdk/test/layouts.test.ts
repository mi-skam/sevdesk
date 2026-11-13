import { describe, expect, it } from 'vitest';
import { CreditNotesResource } from '../src/resources/credit-notes';
import { InvoicesResource } from '../src/resources/invoices';
import { LayoutsResource } from '../src/resources/layouts';
import { OrdersResource } from '../src/resources/orders';
import { createHttpClient, createMockFetch, lastRequest } from './helpers';

const BASE_URL = 'https://my.sevdesk.de/api/v1';

describe('LayoutsResource', () => {
  it('unwraps the letterpapers', async () => {
    const fetch = createMockFetch({
      result: '1',
      letterpapers: [{ id: '1', name: 'ACME' }],
    });

    const letterpapers = await new LayoutsResource(
      createHttpClient(fetch),
    ).listLetterpapers();

    expect(letterpapers).toEqual([{ id: '1', name: 'ACME' }]);
    expect(lastRequest(fetch).url).toBe(
      `${BASE_URL}/DocServer/getLetterpapersWithThumb`,
    );
  });

  it('filters templates by type and unwraps them', async () => {
    const fetch = createMockFetch({
      result: '1',
      templates: [{ id: '2', type: 'Invoicereminder' }],
    });

    const templates = await new LayoutsResource(
      createHttpClient(fetch),
    ).listTemplates({ type: 'Invoicereminder' });

    expect(templates).toEqual([{ id: '2', type: 'Invoicereminder' }]);
    expect(lastRequest(fetch).url).toBe(
      `${BASE_URL}/DocServer/getTemplatesWithThumb?type=Invoicereminder`,
    );
  });

  it('returns an empty list when the key is missing', async () => {
    const fetch = createMockFetch({ result: '1' });

    await expect(
      new LayoutsResource(createHttpClient(fetch)).listTemplates(),
    ).resolves.toEqual([]);
  });
});

describe('changeParameter', () => {
  const result = { result: '1', metadaten: { pdf: 'JVBERi0=', docId: 'd1' } };

  it.each([
    [
      'Invoice',
      (f: typeof globalThis.fetch) =>
        new InvoicesResource(createHttpClient(f)).changeParameter({
          invoiceId: 3,
          key: 'template',
          value: '2',
        }),
    ],
    [
      'Order',
      (f: typeof globalThis.fetch) =>
        new OrdersResource(createHttpClient(f)).changeParameter({
          orderId: 3,
          key: 'template',
          value: '2',
        }),
    ],
    [
      'CreditNote',
      (f: typeof globalThis.fetch) =>
        new CreditNotesResource(createHttpClient(f)).changeParameter({
          creditNoteId: 3,
          key: 'template',
          value: '2',
        }),
    ],
  ])('puts the key and value for %s', async (path, call) => {
    const fetch = createMockFetch({ objects: result });

    await expect(call(fetch)).resolves.toEqual(result);

    const { url, init } = lastRequest(fetch);
    expect(url).toBe(`${BASE_URL}/${path}/3/changeParameter`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({
      key: 'template',
      value: '2',
    });
  });
});

describe('CreditNotesResource.sendByWithRender', () => {
  it('sends the send type as query parameter', async () => {
    const fetch = createMockFetch({
      objects: { pdf: 'JVBERi0=', docId: 'd1', parameters: [] },
    });

    const rendered = await new CreditNotesResource(
      createHttpClient(fetch),
    ).sendByWithRender({ creditNoteId: 3, sendType: 'VPR' });

    expect(rendered.pdf).toBe('JVBERi0=');
    const { url, init } = lastRequest(fetch);
    expect(url).toBe(`${BASE_URL}/CreditNote/3/sendByWithRender?sendType=VPR`);
    expect(init.method).toBe('GET');
  });
});
