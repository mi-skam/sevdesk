import { SevDeskError } from '../errors';
import type { ListOptions, ModelRefResponse } from '../types';
import { BaseResource } from './base';

export interface ListAccountingContactsOptions extends ListOptions {
  /** Only the accounting contact of this contact. */
  contactId?: number;
}

export interface CreateAccountingContactOptions {
  /** The contact the debitor and creditor numbers belong to. */
  contactId: number;
  debitorNumber?: number;
  creditorNumber?: number;
}

export interface UpdateAccountingContactOptions extends Partial<CreateAccountingContactOptions> {
  accountingContactId: number;
}

/** The debitor and creditor numbers sevdesk books a contact under. */
export interface AccountingContact {
  id: string;
  objectName: string;
  create: string;
  update: string;
  /**
   * Missing (not `null`) when the accounting contact belongs to a bare name
   * rather than a contact, such as a voucher supplier entered without one;
   * `contactName` carries the name then. Verified live.
   */
  contact?: ModelRefResponse;
  /** Set only when `contact` is missing. Not in the spec. */
  contactName: string | null;
  /** Not in the spec; always `null` so far. */
  additionalInformation: string | null;
  sevClient: ModelRefResponse;
  debitorNumber: string | null;
  creditorNumber: string | null;
}

export class AccountingContactsResource extends BaseResource {
  /**
   * Retrieves accounting contacts via `GET /AccountingContact`, ordered by
   * contact ID with the name-only ones (no `contact`) first by ID.
   */
  public list(
    options: ListAccountingContactsOptions = {},
  ): Promise<AccountingContact[]> {
    const { contactId, limit, offset } = options;
    return this.http.request<AccountingContact[]>({
      method: 'GET',
      path: '/AccountingContact',
      query: {
        'contact[id]': contactId,
        'contact[objectName]': contactId === undefined ? undefined : 'Contact',
        limit,
        offset,
      },
    });
  }

  /** Retrieves a single accounting contact via `GET /AccountingContact/{accountingContactId}`. */
  public async get(options: {
    accountingContactId: number;
  }): Promise<AccountingContact> {
    const accountingContacts = await this.http.request<AccountingContact[]>({
      method: 'GET',
      path: `/AccountingContact/${options.accountingContactId}`,
    });
    const accountingContact = accountingContacts[0];
    if (!accountingContact) {
      throw new SevDeskError({
        status: 404,
        statusText: 'Not Found',
        body: null,
      });
    }
    return accountingContact;
  }

  /** Creates an accounting contact via `POST /AccountingContact`. */
  public create(
    options: CreateAccountingContactOptions,
  ): Promise<AccountingContact> {
    return this.http.request<AccountingContact>({
      method: 'POST',
      path: '/AccountingContact',
      body: toAccountingContactBody(options),
    });
  }

  /**
   * Updates an accounting contact via `PUT /AccountingContact/{accountingContactId}`.
   * sevdesk warns that changing the numbers can cause booking errors,
   * especially in the DATEV export.
   */
  public update(
    options: UpdateAccountingContactOptions,
  ): Promise<AccountingContact> {
    const { accountingContactId, ...fields } = options;
    return this.http.request<AccountingContact>({
      method: 'PUT',
      path: `/AccountingContact/${accountingContactId}`,
      body: toAccountingContactBody(fields),
    });
  }

  /**
   * Deletes an accounting contact via `DELETE /AccountingContact/{accountingContactId}`.
   * sevdesk warns that this can cause booking errors, especially in the DATEV export.
   */
  public async delete(options: { accountingContactId: number }): Promise<void> {
    await this.http.request<void>({
      method: 'DELETE',
      path: `/AccountingContact/${options.accountingContactId}`,
    });
  }
}

function toAccountingContactBody(
  fields: Partial<CreateAccountingContactOptions>,
): Record<string, unknown> {
  return {
    objectName: 'AccountingContact',
    mapAll: true,
    contact:
      fields.contactId === undefined
        ? undefined
        : { id: fields.contactId, objectName: 'Contact' },
    debitorNumber: fields.debitorNumber,
    creditorNumber: fields.creditorNumber,
  };
}
