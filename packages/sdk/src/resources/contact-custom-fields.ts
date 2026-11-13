import { SevDeskError } from '../errors';
import type { ListOptions, ModelRefResponse } from '../types';
import { BaseResource } from './base';

export interface ListContactCustomFieldsOptions extends ListOptions {
  /** Only the fields of this contact. */
  contactId?: number;
}

export interface CreateContactCustomFieldOptions {
  contactId: number;
  /** The field definition, see `ContactCustomFieldSettingsResource`. */
  settingId: number;
  value: string;
}

export interface UpdateContactCustomFieldOptions extends Partial<CreateContactCustomFieldOptions> {
  contactCustomFieldId: number;
}

/** A field definition that every contact can have a value for. */
export interface ContactCustomFieldSetting {
  id: string;
  objectName: string;
  create: string;
  update: string;
  sevClient: ModelRefResponse;
  name: string;
  /** Unique key of the field, derived by sevdesk from the name. */
  identifier: string;
  description: string | null;
}

/** The value of a custom field for one contact. */
export interface ContactCustomField {
  id: string;
  objectName: string;
  create: string;
  update: string;
  sevClient: ModelRefResponse;
  contact: ModelRefResponse;
  contactCustomFieldSetting: ModelRefResponse | ContactCustomFieldSetting;
  value: string;
}

export interface CreateContactCustomFieldSettingOptions {
  name: string;
  description?: string;
}

export interface UpdateContactCustomFieldSettingOptions extends Partial<CreateContactCustomFieldSettingOptions> {
  contactCustomFieldSettingId: number;
}

function first<T>(records: T[]): T {
  const record = records[0];
  if (!record) {
    throw new SevDeskError({
      status: 404,
      statusText: 'Not Found',
      body: null,
    });
  }
  return record;
}

/** Some endpoints wrap their single result in an array, others do not. */
function single<T>(result: T | T[]): T {
  return Array.isArray(result) ? first(result) : result;
}

export class ContactCustomFieldsResource extends BaseResource {
  /** Retrieves custom field values via `GET /ContactCustomField`. */
  public list(
    options: ListContactCustomFieldsOptions = {},
  ): Promise<ContactCustomField[]> {
    const { contactId, limit, offset } = options;
    return this.http.request<ContactCustomField[]>({
      method: 'GET',
      path: '/ContactCustomField',
      query: {
        'contact[id]': contactId,
        'contact[objectName]': contactId === undefined ? undefined : 'Contact',
        limit,
        offset,
      },
    });
  }

  /** Retrieves one custom field value via `GET /ContactCustomField/{contactCustomFieldId}`. */
  public async get(options: {
    contactCustomFieldId: number;
  }): Promise<ContactCustomField> {
    return first(
      await this.http.request<ContactCustomField[]>({
        method: 'GET',
        path: `/ContactCustomField/${options.contactCustomFieldId}`,
      }),
    );
  }

  /** Sets a custom field of a contact via `POST /ContactCustomField`. */
  public async create(
    options: CreateContactCustomFieldOptions,
  ): Promise<ContactCustomField> {
    return single(
      await this.http.request<ContactCustomField | ContactCustomField[]>({
        method: 'POST',
        path: '/ContactCustomField',
        body: toFieldBody(options),
      }),
    );
  }

  /** Updates a custom field value via `PUT /ContactCustomField/{contactCustomFieldId}`. */
  public async update(
    options: UpdateContactCustomFieldOptions,
  ): Promise<ContactCustomField> {
    const { contactCustomFieldId, ...fields } = options;
    return single(
      await this.http.request<ContactCustomField | ContactCustomField[]>({
        method: 'PUT',
        path: `/ContactCustomField/${contactCustomFieldId}`,
        body: toFieldBody(fields),
      }),
    );
  }

  /** Deletes a custom field value via `DELETE /ContactCustomField/{contactCustomFieldId}`. */
  public async delete(options: {
    contactCustomFieldId: number;
  }): Promise<void> {
    await this.http.request<void>({
      method: 'DELETE',
      path: `/ContactCustomField/${options.contactCustomFieldId}`,
    });
  }
}

export class ContactCustomFieldSettingsResource extends BaseResource {
  /** Retrieves the field definitions via `GET /ContactCustomFieldSetting`. */
  public list(options: ListOptions = {}): Promise<ContactCustomFieldSetting[]> {
    return this.http.request<ContactCustomFieldSetting[]>({
      method: 'GET',
      path: '/ContactCustomFieldSetting',
      query: { limit: options.limit, offset: options.offset },
    });
  }

  /** Retrieves one field definition via `GET /ContactCustomFieldSetting/{contactCustomFieldSettingId}`. */
  public async get(options: {
    contactCustomFieldSettingId: number;
  }): Promise<ContactCustomFieldSetting> {
    return first(
      await this.http.request<ContactCustomFieldSetting[]>({
        method: 'GET',
        path: `/ContactCustomFieldSetting/${options.contactCustomFieldSettingId}`,
      }),
    );
  }

  /** Creates a field definition via `POST /ContactCustomFieldSetting`. */
  public async create(
    options: CreateContactCustomFieldSettingOptions,
  ): Promise<ContactCustomFieldSetting> {
    return single(
      await this.http.request<
        ContactCustomFieldSetting | ContactCustomFieldSetting[]
      >({
        method: 'POST',
        path: '/ContactCustomFieldSetting',
        body: toSettingBody(options),
      }),
    );
  }

  /** Updates a field definition via `PUT /ContactCustomFieldSetting/{contactCustomFieldSettingId}`. */
  public async update(
    options: UpdateContactCustomFieldSettingOptions,
  ): Promise<ContactCustomFieldSetting> {
    const { contactCustomFieldSettingId, ...fields } = options;
    return single(
      await this.http.request<
        ContactCustomFieldSetting | ContactCustomFieldSetting[]
      >({
        method: 'PUT',
        path: `/ContactCustomFieldSetting/${contactCustomFieldSettingId}`,
        body: toSettingBody(fields),
      }),
    );
  }

  /** Deletes a field definition via `DELETE /ContactCustomFieldSetting/{contactCustomFieldSettingId}`. */
  public async delete(options: {
    contactCustomFieldSettingId: number;
  }): Promise<void> {
    await this.http.request<void>({
      method: 'DELETE',
      path: `/ContactCustomFieldSetting/${options.contactCustomFieldSettingId}`,
    });
  }

  /**
   * Counts the contacts with a value for a field definition via
   * `GET /ContactCustomFieldSetting/{contactCustomFieldSettingId}/getReferenceCount`.
   */
  public referenceCount(options: {
    contactCustomFieldSettingId: number;
  }): Promise<number> {
    return this.http.request<number>({
      method: 'GET',
      path: `/ContactCustomFieldSetting/${options.contactCustomFieldSettingId}/getReferenceCount`,
    });
  }
}

function toFieldBody(
  fields: Partial<CreateContactCustomFieldOptions>,
): Record<string, unknown> {
  return {
    objectName: 'ContactCustomField',
    mapAll: true,
    contact:
      fields.contactId === undefined
        ? undefined
        : { id: fields.contactId, objectName: 'Contact' },
    contactCustomFieldSetting:
      fields.settingId === undefined
        ? undefined
        : { id: fields.settingId, objectName: 'ContactCustomFieldSetting' },
    value: fields.value,
  };
}

function toSettingBody(
  fields: Partial<CreateContactCustomFieldSettingOptions>,
): Record<string, unknown> {
  return {
    objectName: 'ContactCustomFieldSetting',
    mapAll: true,
    name: fields.name,
    description: fields.description,
  };
}
