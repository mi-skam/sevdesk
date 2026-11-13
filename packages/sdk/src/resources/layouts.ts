import { BaseResource } from './base';

/**
 * Template types `GET /DocServer/getTemplatesWithThumb` filters by. The filter
 * is case-sensitive: the spec's `invoicereminder` matches nothing.
 */
export type TemplateType =
  | 'Invoice'
  | 'Invoicereminder'
  | 'Order'
  | 'Contractnote'
  | 'Packinglist'
  | 'Letter'
  | 'Creditnote';

export interface Letterpaper {
  id: string;
  name: string;
  /** `1` for the default letterpaper. */
  default: number;
  /** Uploaded by the account rather than provided by sevdesk. */
  isCustom: boolean;
  /** Base64-encoded PDF. */
  pdf: string;
  /** Base64-encoded thumbnail. */
  img: string;
  sevClient: string;
}

export interface Template {
  id: string;
  name: string;
  translationCode: string;
  type: string;
  html: string;
  /** Base64-encoded thumbnail. */
  img: string;
  /** The default template of its type; comes back as a boolean or a number. */
  default: boolean | number;
  premium: boolean;
  isCustom: boolean;
  inactive: boolean;
  structure: string;
  pdfreactorVersion: string;
  sevClient: string;
}

/** What `changeParameter` changes on a document. */
export interface ChangeLayoutOptions {
  key: 'language' | 'template' | 'letterpaper' | 'payPal';
  /** The template or letterpaper ID, the language code or the PayPal value. */
  value: string;
}

export interface ChangeLayoutResult {
  result: string;
  metadaten: {
    /** The re-rendered document as Base64-encoded PDF (since 07.04.2026). */
    pdf: string;
    docId: string;
  };
}

export class LayoutsResource extends BaseResource {
  /** Retrieves the letterpapers via `GET /DocServer/getLetterpapersWithThumb`. */
  public async listLetterpapers(): Promise<Letterpaper[]> {
    const result = await this.http.request<{ letterpapers?: Letterpaper[] }>({
      method: 'GET',
      path: '/DocServer/getLetterpapersWithThumb',
    });
    return result.letterpapers ?? [];
  }

  /** Retrieves the document templates via `GET /DocServer/getTemplatesWithThumb`. */
  public async listTemplates(
    options: { type?: TemplateType } = {},
  ): Promise<Template[]> {
    const result = await this.http.request<{ templates?: Template[] }>({
      method: 'GET',
      path: '/DocServer/getTemplatesWithThumb',
      query: { type: options.type },
    });
    return result.templates ?? [];
  }
}
