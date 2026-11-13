import { SevDeskError, type SevDesk } from '@mi-skam/sevdesk-sdk';
import { fetchAll } from './pagination';
import { isoTimestamp, type Store, type StoredRecord } from './store';

/**
 * How far before the stored watermark an incremental sync starts again.
 * Records that become visible slightly late are still caught; re-fetching a
 * few known ones costs nothing because unchanged records are not rewritten.
 */
export const SYNC_OVERLAP_MS = 60 * 60 * 1000;

/**
 * Incremental syncs cannot see deletions, so an entity synced incrementally
 * is fetched in full again once its last full sync is older than this.
 */
export const FULL_SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

type Page = { limit: number; offset: number };

export interface EntityDefinition {
  /** Name in the database and in `db:info`, matching the CLI command group. */
  name: string;
  /**
   * Fetches one page. `updatedSince` is only passed to entities whose
   * endpoint has an `updateAfter` filter (see `incremental`).
   */
  fetchPage(
    client: SevDesk,
    page: Page,
    updatedSince?: Date,
  ): Promise<StoredRecord[]>;
  /** The endpoint filters on `updateAfter`, so later syncs fetch only changes. */
  incremental: boolean;
}

/**
 * Every entity `db:sync` copies. Embeds match the ones the list and get
 * commands request, so `--local` output equals live output.
 */
export const ENTITIES: readonly EntityDefinition[] = [
  {
    name: 'contacts',
    incremental: true,
    fetchPage: (client, page, updatedSince) =>
      client.contacts.list({
        depth: '1',
        ...(updatedSince ? { updateAfter: updatedSince } : {}),
        ...page,
      }),
  },
  {
    name: 'accounting-contacts',
    incremental: false,
    fetchPage: (client, page) => client.accountingContacts.list(page),
  },
  {
    name: 'contact-field-settings',
    incremental: false,
    fetchPage: (client, page) => client.contactCustomFieldSettings.list(page),
  },
  {
    name: 'contact-fields',
    incremental: false,
    fetchPage: (client, page) => client.contactCustomFields.list(page),
  },
  {
    name: 'contact-addresses',
    incremental: false,
    fetchPage: (client, page) => client.contactAddresses.list(page),
  },
  {
    name: 'communication-ways',
    incremental: false,
    fetchPage: (client, page) => client.communicationWays.list(page),
  },
  {
    name: 'invoices',
    incremental: true,
    fetchPage: (client, page, updatedSince) =>
      client.invoices.list({
        showAll: true,
        embed: ['contact'],
        ...(updatedSince ? { updateAfter: updatedSince } : {}),
        ...page,
      }),
  },
  {
    name: 'invoice-positions',
    incremental: false,
    fetchPage: (client, page) => client.invoices.listPositions(page),
  },
  {
    name: 'credit-notes',
    incremental: false,
    fetchPage: (client, page) =>
      client.creditNotes.list({ embed: ['contact'], ...page }),
  },
  {
    name: 'credit-note-positions',
    incremental: false,
    fetchPage: (client, page) => client.creditNotes.listPositions(page),
  },
  {
    name: 'orders',
    incremental: true,
    fetchPage: (client, page, updatedSince) =>
      client.orders.list({
        embed: ['contact'],
        ...(updatedSince ? { updateAfter: updatedSince } : {}),
        ...page,
      }),
  },
  {
    name: 'order-positions',
    incremental: false,
    fetchPage: (client, page) => client.orders.listPositions(page),
  },
  {
    name: 'vouchers',
    incremental: true,
    fetchPage: (client, page, updatedSince) =>
      client.vouchers.list({
        embed: ['supplier'],
        ...(updatedSince ? { updateAfter: updatedSince } : {}),
        ...page,
      }),
  },
  {
    name: 'voucher-positions',
    incremental: false,
    fetchPage: (client, page) =>
      client.vouchers.listPositions({ embed: ['accountDatev'], ...page }),
  },
  {
    name: 'check-accounts',
    incremental: false,
    fetchPage: (client, page) => client.checkAccounts.list(page),
  },
  {
    name: 'transactions',
    incremental: false,
    fetchPage: (client, page) => client.transactions.list(page),
  },
  {
    name: 'private-transaction-rules',
    incremental: false,
    fetchPage: (client, page) => client.privateTransactionRules.list(page),
  },
  {
    name: 'accounts-datev',
    incremental: false,
    fetchPage: (client, page) => client.accountsDatev.list(page),
  },
  {
    name: 'tags',
    incremental: false,
    fetchPage: (client, page) => client.tags.list(page),
  },
  {
    name: 'tag-relations',
    incremental: false,
    fetchPage: (client, page) => client.tags.listRelations(page),
  },
  {
    name: 'parts',
    incremental: false,
    fetchPage: (client, page) => client.parts.list(page),
  },
];

export interface EntitySyncResult {
  entity: string;
  /** `full` fetched every record; `incremental` only changed ones. */
  mode: 'full' | 'incremental';
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** Records a full sync no longer saw; they are kept and marked deleted. */
  deleted: number;
}

export interface SyncResult {
  entities: EntitySyncResult[];
  /** Entities the API token may not read (`403`); left untouched. */
  skipped: string[];
  requests: number;
}

export interface SyncOptions {
  /** Fetch every entity in full, which also detects deletions. */
  full?: boolean;
  now?: Date;
  entities?: readonly EntityDefinition[];
}

interface Fetched {
  definition: EntityDefinition;
  mode: 'full' | 'incremental';
  records: StoredRecord[];
}

function needsFullSync(
  definition: EntityDefinition,
  store: Store,
  now: Date,
  forced: boolean,
): boolean {
  if (forced || !definition.incremental) {
    return true;
  }
  const state = store.syncState(definition.name);
  if (!state?.watermark || !state.lastFullSync) {
    return true;
  }
  return (
    now.getTime() - Date.parse(state.lastFullSync) >= FULL_SYNC_INTERVAL_MS
  );
}

/**
 * Brings the store up to date. Everything is fetched first and then written
 * in one database transaction, so a failed request leaves the store as it
 * was.
 */
export async function syncStore(
  client: SevDesk,
  store: Store,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const now = options.now ?? new Date();
  const definitions = options.entities ?? ENTITIES;
  let requests = 0;
  const fetched: Fetched[] = [];
  const skipped: string[] = [];

  for (const definition of definitions) {
    const full = needsFullSync(definition, store, now, options.full ?? false);
    const watermark = store.syncState(definition.name)?.watermark;
    const updatedSince =
      full || !watermark
        ? undefined
        : new Date(Date.parse(watermark) - SYNC_OVERLAP_MS);
    try {
      const records = await fetchAll((page) => {
        requests += 1;
        return definition.fetchPage(client, page, updatedSince);
      });
      fetched.push({
        definition,
        mode: full ? 'full' : 'incremental',
        records,
      });
    } catch (error) {
      if (error instanceof SevDeskError && error.status === 403) {
        skipped.push(definition.name);
        continue;
      }
      throw error;
    }
  }

  const entities = store.transaction(() => {
    const results = fetched.map(({ definition, mode, records }) => {
      const written = store.upsert(definition.name, records, now);
      const deleted =
        mode === 'full'
          ? store.markMissingDeleted(
              definition.name,
              new Set(records.map((record) => record.id)),
              now,
            )
          : 0;
      const previous = store.syncState(definition.name);
      store.setSyncState(definition.name, {
        watermark: newestUpdate(records, previous?.watermark ?? null),
        lastFullSync:
          mode === 'full'
            ? now.toISOString()
            : (previous?.lastFullSync ?? null),
        lastSync: now.toISOString(),
      });
      return {
        entity: definition.name,
        mode,
        fetched: records.length,
        ...written,
        deleted,
      };
    });
    store.setMeta('last_sync', now.toISOString());
    return results;
  });

  return { entities, skipped, requests };
}

function newestUpdate(
  records: StoredRecord[],
  previous: string | null,
): string | null {
  return records.reduce<string | null>((newest, record) => {
    const update = isoTimestamp(record.update);
    return update !== null && (newest === null || update > newest)
      ? update
      : newest;
  }, previous);
}
