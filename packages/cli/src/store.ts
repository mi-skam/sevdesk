import { existsSync } from 'node:fs';
import { chmod, mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type * as Sqlite from 'node:sqlite';

/**
 * The local database. It keeps a copy of every record `db:sync` has fetched,
 * so read commands can answer without a request and data stays available
 * even if the API stops serving it. It holds live accounting data and is
 * created with mode 0600 outside the repository.
 */
export function databasePath(): string {
  const explicit = process.env['SEVDESK_DB']?.trim();
  if (explicit) {
    return explicit;
  }
  const xdgDataHome = process.env['XDG_DATA_HOME'];
  const base = xdgDataHome ? xdgDataHome : join(homedir(), '.local', 'share');
  return join(base, 'sevdesk', 'sevdesk.db');
}

/**
 * One table for every entity: the API object is stored unchanged in `data`,
 * so local reads return exactly what the API returned. Records a full sync no
 * longer sees are kept and marked with `deleted_at`, never removed.
 */
const SCHEMA_V1 = `
  CREATE TABLE records (
    entity TEXT NOT NULL,
    id TEXT NOT NULL,
    updated_at TEXT,
    created_at TEXT,
    deleted_at TEXT,
    data TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    PRIMARY KEY (entity, id)
  );
  CREATE INDEX records_live ON records (entity, deleted_at);
  -- watermark: newest updated_at seen, the start of the next incremental sync.
  CREATE TABLE sync_state (
    entity TEXT PRIMARY KEY,
    watermark TEXT,
    last_full_sync TEXT,
    last_sync TEXT NOT NULL
  );
  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

/**
 * The change log: one row per change a sync saw — a record that appeared, a
 * stored record whose data differs, one a full sync no longer saw, or one
 * seen again after that. `previous` and `data` are the record before and
 * after (`previous` is null for `new`, `data` for `deleted`). Changes that
 * happen and are superseded between two syncs are not in the log, and the
 * first sync of an entity logs nothing: it has nothing to compare against.
 */
const SCHEMA_V2 = `
  CREATE TABLE changes (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    entity TEXT NOT NULL,
    id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('new', 'updated', 'deleted', 'restored')),
    previous TEXT,
    data TEXT,
    recorded_at TEXT NOT NULL
  );
  CREATE INDEX changes_record ON changes (entity, id);
  CREATE INDEX changes_recorded_at ON changes (recorded_at);
`;

/** `MIGRATIONS[n]` brings a database from schema version `n` to `n + 1`. */
const MIGRATIONS = [SCHEMA_V1, SCHEMA_V2];
const SCHEMA_VERSION = MIGRATIONS.length;

/** A record as the API returns it: every entity has a string `id`. */
export interface StoredRecord {
  id: string;
  update?: string | null;
  create?: string | null;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  unchanged: number;
}

export type ChangeKind = 'new' | 'updated' | 'deleted' | 'restored';

/** One entry of the change log. */
export interface Change {
  seq: number;
  entity: string;
  id: string;
  kind: ChangeKind;
  /** The record before the change; `null` for `new`. */
  previous: unknown;
  /** The record after the change; `null` for `deleted`. */
  data: unknown;
  recordedAt: string;
}

export interface ChangeQuery {
  entity?: string;
  id?: string;
  /** Only changes recorded at or after this ISO timestamp. */
  since?: string;
  limit?: number;
}

export interface SyncState {
  watermark: string | null;
  lastFullSync: string | null;
  lastSync: string;
}

export interface EntityInfo {
  entity: string;
  records: number;
  deleted: number;
  lastSync: string | null;
  lastFullSync: string | null;
}

export interface StoreInfo {
  path: string;
  bytes: number;
  lastSync: string | null;
  /** Entries in the change log. */
  changes: number;
  entities: EntityInfo[];
}

/**
 * Normalizes an API timestamp (`2026-01-01T10:00:00+01:00`) to
 * `toISOString()`, so text order is time order. Unparseable values are `null`.
 */
export function isoTimestamp(
  value: string | Date | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * `node:sqlite` is built into Node.js 22.13 and later. It is loaded only when
 * a command needs the database, and its "experimental" warning is not shown:
 * it is noise for CLI users.
 */
async function loadSqlite(): Promise<typeof Sqlite> {
  const emitWarning = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const message = typeof warning === 'string' ? warning : warning.message;
    if (/sqlite/i.test(message)) {
      return;
    }
    return (emitWarning as (...args: unknown[]) => void).call(
      process,
      warning,
      ...rest,
    );
  }) as typeof process.emitWarning;
  try {
    return await import('node:sqlite');
  } catch {
    throw new Error(
      `The local database needs Node.js 22.13 or later (this is ${process.version}).`,
    );
  } finally {
    process.emitWarning = emitWarning;
  }
}

export class Store {
  private constructor(
    private readonly db: Sqlite.DatabaseSync,
    readonly path: string,
  ) {}

  /**
   * Opens the database. With `create: false` a missing database is an error
   * that points to `sevdesk db:sync`, so read commands never create an empty
   * one.
   */
  static async open(
    options: { create: boolean; path?: string } = { create: false },
  ): Promise<Store> {
    const path = options.path ?? databasePath();
    const exists = existsSync(path);
    if (!exists && !options.create) {
      throw new Error(
        `No local database at ${path}. Run \`sevdesk db:sync\` first.`,
      );
    }
    if (!exists) {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    }
    const { DatabaseSync } = await loadSqlite();
    const db = new DatabaseSync(path);
    if (!exists) {
      await chmod(path, 0o600);
    }
    const store = new Store(db, path);
    store.migrate();
    return store;
  }

  private migrate(): void {
    const { user_version: version } = this.db
      .prepare('PRAGMA user_version')
      .get() as { user_version: number };
    if (version > SCHEMA_VERSION) {
      throw new Error(
        `The local database at ${this.path} was created by a newer sevdesk version. Update the CLI.`,
      );
    }
    if (version < SCHEMA_VERSION) {
      this.transaction(() => {
        for (const step of MIGRATIONS.slice(version)) {
          this.db.exec(step);
        }
        this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      });
    }
  }

  close(): void {
    this.db.close();
  }

  /** Runs `work` in one SQLite transaction: all of it is written or none. */
  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Inserts new records and replaces stored ones whose data changed. A record
   * that was marked deleted and is seen again is restored. With `log`, every
   * such change is also written to the change log.
   */
  upsert(
    entity: string,
    records: StoredRecord[],
    syncedAt: Date,
    options: { log?: boolean } = {},
  ): UpsertResult {
    const existing = this.db.prepare(
      'SELECT data, deleted_at FROM records WHERE entity = ? AND id = ?',
    );
    const write = this.db.prepare(
      `INSERT INTO records
         (entity, id, updated_at, created_at, deleted_at, data, synced_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT (entity, id) DO UPDATE SET
         updated_at = excluded.updated_at, created_at = excluded.created_at,
         deleted_at = NULL, data = excluded.data, synced_at = excluded.synced_at`,
    );
    const result: UpsertResult = { inserted: 0, updated: 0, unchanged: 0 };
    for (const record of records) {
      const data = JSON.stringify(record);
      const stored = existing.get(entity, record.id) as
        { data: string; deleted_at: string | null } | undefined;
      if (stored && stored.data === data && stored.deleted_at === null) {
        result.unchanged += 1;
        continue;
      }
      write.run(
        entity,
        record.id,
        isoTimestamp(record.update),
        isoTimestamp(record.create),
        data,
        isoTimestamp(syncedAt),
      );
      if (options.log) {
        const kind: ChangeKind = !stored
          ? 'new'
          : stored.deleted_at === null
            ? 'updated'
            : 'restored';
        this.logChange(
          entity,
          record.id,
          kind,
          stored?.data ?? null,
          data,
          syncedAt,
        );
      }
      if (stored) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }
    return result;
  }

  /**
   * Marks every live record of `entity` that is not in `seenIds` as deleted.
   * Only call it after a complete fetch of the entity.
   */
  markMissingDeleted(
    entity: string,
    seenIds: ReadonlySet<string>,
    now: Date,
    options: { log?: boolean } = {},
  ): number {
    const live = this.db
      .prepare(
        'SELECT id, data FROM records WHERE entity = ? AND deleted_at IS NULL',
      )
      .all(entity) as Array<{ id: string; data: string }>;
    const mark = this.db.prepare(
      'UPDATE records SET deleted_at = ? WHERE entity = ? AND id = ?',
    );
    let deleted = 0;
    for (const { id, data } of live) {
      if (!seenIds.has(id)) {
        mark.run(isoTimestamp(now), entity, id);
        if (options.log) {
          this.logChange(entity, id, 'deleted', data, null, now);
        }
        deleted += 1;
      }
    }
    return deleted;
  }

  private logChange(
    entity: string,
    id: string,
    kind: ChangeKind,
    previous: string | null,
    data: string | null,
    recordedAt: Date,
  ): void {
    this.db
      .prepare(
        `INSERT INTO changes (entity, id, kind, previous, data, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(entity, id, kind, previous, data, isoTimestamp(recordedAt));
  }

  /** Change log entries matching `query`, newest first. */
  changes(query: ChangeQuery = {}): Change[] {
    const where: string[] = [];
    const params: string[] = [];
    if (query.entity !== undefined) {
      where.push('entity = ?');
      params.push(query.entity);
    }
    if (query.id !== undefined) {
      where.push('id = ?');
      params.push(query.id);
    }
    if (query.since !== undefined) {
      where.push('recorded_at >= ?');
      params.push(query.since);
    }
    const limit =
      query.limit === undefined
        ? ''
        : ` LIMIT ${Math.max(0, Math.floor(query.limit))}`;
    const rows = this.db
      .prepare(
        `SELECT seq, entity, id, kind, previous, data, recorded_at FROM changes
         ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY seq DESC${limit}`,
      )
      .all(...params) as Array<{
      seq: number;
      entity: string;
      id: string;
      kind: ChangeKind;
      previous: string | null;
      data: string | null;
      recorded_at: string;
    }>;
    return rows.map((row) => ({
      seq: row.seq,
      entity: row.entity,
      id: row.id,
      kind: row.kind,
      previous:
        row.previous === null ? null : (JSON.parse(row.previous) as unknown),
      data: row.data === null ? null : (JSON.parse(row.data) as unknown),
      recordedAt: row.recorded_at,
    }));
  }

  /** Stored records of an entity in ascending ID order, live ones only by default. */
  records<T>(entity: string, options: { includeDeleted?: boolean } = {}): T[] {
    const deleted = options.includeDeleted ? '' : ' AND deleted_at IS NULL';
    return this.db
      .prepare(
        `SELECT data FROM records WHERE entity = ?${deleted}
         ORDER BY CAST(id AS INTEGER), id`,
      )
      .all(entity)
      .map((row) => JSON.parse((row as { data: string }).data) as T);
  }

  /** One stored record, including a deleted one, or `null`. */
  record<T>(
    entity: string,
    id: string,
  ): { data: T; deletedAt: string | null } | null {
    const row = this.db
      .prepare(
        'SELECT data, deleted_at FROM records WHERE entity = ? AND id = ?',
      )
      .get(entity, id) as
      { data: string; deleted_at: string | null } | undefined;
    return row
      ? { data: JSON.parse(row.data) as T, deletedAt: row.deleted_at }
      : null;
  }

  syncState(entity: string): SyncState | null {
    const row = this.db
      .prepare(
        'SELECT watermark, last_full_sync, last_sync FROM sync_state WHERE entity = ?',
      )
      .get(entity) as
      | {
          watermark: string | null;
          last_full_sync: string | null;
          last_sync: string;
        }
      | undefined;
    return row
      ? {
          watermark: row.watermark,
          lastFullSync: row.last_full_sync,
          lastSync: row.last_sync,
        }
      : null;
  }

  setSyncState(entity: string, state: SyncState): void {
    this.db
      .prepare(
        `INSERT INTO sync_state (entity, watermark, last_full_sync, last_sync)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (entity) DO UPDATE SET
           watermark = excluded.watermark,
           last_full_sync = excluded.last_full_sync,
           last_sync = excluded.last_sync`,
      )
      .run(entity, state.watermark, state.lastFullSync, state.lastSync);
  }

  getMeta(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  async info(): Promise<StoreInfo> {
    const rows = this.db
      .prepare(
        `SELECT s.entity AS entity,
                s.last_sync AS last_sync,
                s.last_full_sync AS last_full_sync,
                COUNT(r.id) - COUNT(r.deleted_at) AS live,
                COUNT(r.deleted_at) AS deleted
         FROM sync_state s
         LEFT JOIN records r ON r.entity = s.entity
         GROUP BY s.entity
         ORDER BY s.entity`,
      )
      .all() as Array<{
      entity: string;
      last_sync: string | null;
      last_full_sync: string | null;
      live: number;
      deleted: number;
    }>;
    return {
      path: this.path,
      bytes: (await stat(this.path)).size,
      lastSync: this.getMeta('last_sync'),
      changes: (
        this.db.prepare('SELECT COUNT(*) AS count FROM changes').get() as {
          count: number;
        }
      ).count,
      entities: rows.map((row) => ({
        entity: row.entity,
        records: row.live,
        deleted: row.deleted,
        lastSync: row.last_sync,
        lastFullSync: row.last_full_sync,
      })),
    };
  }
}

/** Opens the store, runs `work` and always closes it again. */
export async function withStore<T>(
  options: { create: boolean; path?: string },
  work: (store: Store) => Promise<T> | T,
): Promise<T> {
  const store = await Store.open(options);
  try {
    return await work(store);
  } finally {
    store.close();
  }
}
