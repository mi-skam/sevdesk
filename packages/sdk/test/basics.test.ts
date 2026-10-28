import { describe, expect, it } from 'vitest';
import { BasicsResource } from '../src/resources/basics';
import { createHttpClient, createMockFetch, lastRequest } from './helpers';

describe('BasicsResource', () => {
  it.each([
    { objectType: 'Invoice', type: 'RE' },
    { objectType: 'Order', type: 'AN' },
  ] as const)(
    'reads numbering without a write for $objectType / $type',
    async (options) => {
      const response = {
        id: '12',
        forObject: options.objectType,
        type: options.type,
        format: 'EXAMPLE-%NUMBER',
        nextSequence: '5',
      };
      const fetch = createMockFetch({ objects: response });
      const resource = new BasicsResource(createHttpClient(fetch));
      expect(await resource.getNumberSequence(options)).toEqual(response);
      const { url, init } = lastRequest(fetch);
      const parsed = new URL(url);
      expect(parsed.pathname).toBe('/api/v1/SevSequence/Factory/getByType');
      expect(parsed.searchParams.get('objectType')).toBe(options.objectType);
      expect(parsed.searchParams.get('type')).toBe(options.type);
      expect(init.method).toBe('GET');
      expect(init.body).toBeUndefined();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('requests the bookkeeping system version and returns the version string', async () => {
    const fetch = createMockFetch({ objects: { version: '2.0' } });
    const resource = new BasicsResource(createHttpClient(fetch));

    const version = await resource.getBookkeepingSystemVersion();

    expect(version).toBe('2.0');
    const { url, init } = lastRequest(fetch);
    expect(url).toBe(
      'https://my.sevdesk.de/api/v1/Tools/bookkeepingSystemVersion',
    );
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });
});
