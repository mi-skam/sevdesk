import { consola } from 'consola';
import { afterEach, describe, expect, it, vi } from 'vitest';
import get from '../src/commands/numbering/get';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('read-only numbering lookup (Nummernkreis)', () => {
  it.each([
    { kind: 'invoice', objectType: 'Invoice', type: 'RE' },
    { kind: 'quote', objectType: 'Order', type: 'AN' },
  ] as const)(
    'reads $kind numbering via GET only',
    async ({ kind, objectType, type }) => {
      vi.stubEnv('SEVDESK_TOKEN', 'test-token');
      const response = {
        id: '12',
        forObject: objectType,
        type,
        format: 'EXAMPLE-%NUMBER',
        nextSequence: '5',
      };
      const fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ objects: response }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', fetch);
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      await get.action({ kind, json: true }, undefined);
      expect(fetch).toHaveBeenCalledTimes(1);
      const [input, init] = fetch.mock.calls[0]!;
      const url = new URL(input);
      expect(url.pathname).toBe('/api/v1/SevSequence/Factory/getByType');
      expect(url.searchParams.get('objectType')).toBe(objectType);
      expect(url.searchParams.get('type')).toBe(type);
      expect(init.method).toBe('GET');
      expect(init.body).toBeUndefined();
      expect(JSON.parse(log.mock.calls[0]![0])).toEqual(response);
    },
  );
  it.each([
    {
      kind: 'invoice',
      objectType: 'Invoice',
      type: 'RE',
      collection: '/Invoice',
    },
    { kind: 'quote', objectType: 'Order', type: 'AN', collection: '/Order' },
  ] as const)(
    'suggests $kind numbers using read-only history and emits reserved=false',
    async ({ kind, objectType, type, collection }) => {
      vi.stubEnv('SEVDESK_TOKEN', 'test-token');
      const fetch = vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = new URL(String(input));
          expect(init?.method).toBe('GET');
          const numberField =
            kind === 'invoice' ? 'invoiceNumber' : 'orderNumber';
          const objects = url.pathname.endsWith('/getByType')
            ? {
                id: '12',
                forObject: objectType,
                type,
                format: `${type}-%NUMBER`,
                nextSequence: '2',
              }
            : url.searchParams.get('offset') === '0'
              ? [
                  { [numberField]: `${type}-9`, status: '100' },
                  { [numberField]: `${type}-10`, status: '100' },
                ]
              : [];
          if (!url.pathname.endsWith('/getByType'))
            expect(url.pathname).toBe('/api/v1' + collection);
          return new Response(JSON.stringify({ objects }), {
            headers: { 'Content-Type': 'application/json' },
          });
        },
      );
      vi.stubGlobal('fetch', fetch);
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      await get.action({ kind, suggest: true, json: true }, undefined);
      expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({
        nextNumber: `${type}-11`,
        highestExistingNumber: `${type}-10`,
        reserved: false,
      });
      expect(fetch).toHaveBeenCalledTimes(3);
    },
  );
  it.each([
    [],
    null,
    {},
    {
      forObject: 'Order',
      type: 'AN',
      format: 'EXAMPLE-%NUMBER',
      nextSequence: '5',
    },
  ])('refuses unusable or mismatched numbering data: %j', async (objects) => {
    vi.stubEnv('SEVDESK_TOKEN', 'test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ objects }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(
      get.action({ kind: 'invoice', json: true }, undefined),
    ).rejects.toThrow('Kein nutzbarer Nummernkreis');
  });
  it('labels human output as a non-reserving read', async () => {
    vi.stubEnv('SEVDESK_TOKEN', 'test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            objects: {
              id: '12',
              forObject: 'Invoice',
              type: 'RE',
              format: 'EXAMPLE-%NUMBER',
              nextSequence: '5',
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const info = vi.spyOn(consola, 'info').mockImplementation(() => {});
    await get.action({ kind: 'invoice', json: false }, undefined);
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('keine Nummer reserviert'),
    );
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('Configured counter (Eingestellter Zähler): 5'),
    );
  });
});
