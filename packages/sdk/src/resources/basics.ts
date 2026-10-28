import { BaseResource } from './base';

export type BookkeepingSystemVersion = '1.0' | '2.0';

export interface NumberSequence {
  id: string;
  forObject: string;
  type: string;
  format: string;
  /** Configured counter, not a reservation or guarantee of uniqueness; existing drafts can already use it. */
  nextSequence: string;
}
export type NumberSequenceOptions =
  { objectType: 'Invoice'; type: 'RE' } | { objectType: 'Order'; type: 'AN' };

export class BasicsResource extends BaseResource {
  /** Reads numbering configuration via `GET /SevSequence/Factory/getByType`; does not reserve a number. */
  public getNumberSequence(
    options: NumberSequenceOptions,
  ): Promise<NumberSequence> {
    return this.http.request({
      method: 'GET',
      path: '/SevSequence/Factory/getByType',
      query: options,
    });
  }

  /** Retrieves the bookkeeping system version via `GET /Tools/bookkeepingSystemVersion`. */
  public async getBookkeepingSystemVersion(): Promise<BookkeepingSystemVersion> {
    const result = await this.http.request<{
      version: BookkeepingSystemVersion;
    }>({
      method: 'GET',
      path: '/Tools/bookkeepingSystemVersion',
    });
    return result.version;
  }
}
