import { describe, expect, it } from 'vitest';
import { TextparserResource } from '../src/resources/textparser';
import { createHttpClient, createMockFetch, lastRequest } from './helpers';

describe('TextparserResource.listPlaceholders', () => {
  it('requests the placeholders of a document type', async () => {
    const groups = [
      { key: 'Contact', value: [{ key: '[%KUNDENNUMMER%]', value: 'Number' }] },
    ];
    const fetch = createMockFetch({ objects: groups });

    const result = await new TextparserResource(
      createHttpClient(fetch),
    ).listPlaceholders({ objectName: 'Email', subObjectName: 'Invoice' });

    expect(result).toEqual(groups);
    expect(lastRequest(fetch).url).toBe(
      'https://my.sevdesk.de/api/v1/Textparser/fetchDictionaryEntriesByType?objectName=Email&subObjectName=Invoice',
    );
  });
});
