import { BaseResource } from './base';

/** The document types that have placeholders. */
export type PlaceholderObjectName =
  'Invoice' | 'CreditNote' | 'Order' | 'Contact' | 'Letter' | 'Email';

export interface ListPlaceholdersOptions {
  objectName: PlaceholderObjectName;
  /** For `Email`: the document type the e-mail is sent with. */
  subObjectName?: Exclude<PlaceholderObjectName, 'Email'>;
}

/** A group of placeholders, such as the ones for the contact. */
export interface PlaceholderGroup {
  key: string;
  value: Array<{ key: string; value: string }>;
}

export class TextparserResource extends BaseResource {
  /**
   * Retrieves the placeholders usable in document texts via
   * `GET /Textparser/fetchDictionaryEntriesByType`.
   */
  public listPlaceholders(
    options: ListPlaceholdersOptions,
  ): Promise<PlaceholderGroup[]> {
    return this.http.request<PlaceholderGroup[]>({
      method: 'GET',
      path: '/Textparser/fetchDictionaryEntriesByType',
      query: {
        objectName: options.objectName,
        subObjectName: options.subObjectName,
      },
    });
  }
}
