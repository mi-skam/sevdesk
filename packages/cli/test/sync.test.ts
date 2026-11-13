import { SevDeskError, type SevDesk } from '@mi-skam/sevdesk-sdk';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredRecord } from '../src/store';
import { Store } from '../src/store';
import {
  ENTITIES,
  FULL_SYNC_INTERVAL_MS,
  SYNC_OVERLAP_MS,
  syncStore,
  type EntityDefinition,
} from '../src/sync';

const client = {} as SevDesk;
let dir: string;
let store: Store;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sevdesk-sync-'));
  store = await Store.open({ create: true, path: join(dir, 'sevdesk.db') });
});

afterEach(async () => {
  store.close();
  await rm(dir, { recursive: true, force: true });
});

const t0 = new Date('2026-01-10T12:00:00Z');

function record(id: string, update: string): StoredRecord {
  return { id, update, create: '2026-01-01T00:00:00+01:00' };
}

/**
 * An entity served from `rows`, paged like the API: a page past the end is
 * empty. `fetchPage` records the `updatedSince` it was called with.
 */
function entity(
  name: string,
  rows: () => StoredRecord[],
  incremental = true,
): EntityDefinition & { fetchPage: ReturnType<typeof vi.fn> } {
  return {
    name,
    incremental,
    fetchPage: vi.fn(
      async (_client: SevDesk, page: { limit: number; offset: number }) =>
        rows().slice(page.offset, page.offset + page.limit),
    ),
  };
}

describe('syncStore', () => {
  it('fetches everything on the first run and records the watermark', async () => {
    const vouchers = entity('vouchers', () => [
      record('1', '2026-01-05T10:00:00+01:00'),
      record('2', '2026-01-07T10:00:00+01:00'),
    ]);

    const result = await syncStore(client, store, {
      now: t0,
      entities: [vouchers],
    });

    expect(result.entities).toEqual([
      {
        entity: 'vouchers',
        mode: 'full',
        fetched: 2,
        inserted: 2,
        updated: 0,
        unchanged: 0,
        deleted: 0,
      },
    ]);
    // One page with rows, one empty page that confirms the end.
    expect(result.requests).toBe(2);
    expect(vouchers.fetchPage.mock.calls[0]?.[2]).toBeUndefined();
    expect(store.syncState('vouchers')).toEqual({
      watermark: '2026-01-07T09:00:00.000Z',
      lastFullSync: t0.toISOString(),
      lastSync: t0.toISOString(),
    });
    expect(store.getMeta('last_sync')).toBe(t0.toISOString());
  });

  it('fetches only changes since the watermark minus the overlap', async () => {
    let rows = [record('1', '2026-01-05T10:00:00Z')];
    const vouchers = entity('vouchers', () => rows);
    await syncStore(client, store, { now: t0, entities: [vouchers] });

    rows = [
      record('1', '2026-01-05T10:00:00Z'),
      record('2', '2026-01-11T08:00:00Z'),
    ];
    const t1 = new Date('2026-01-11T12:00:00Z');
    const result = await syncStore(client, store, {
      now: t1,
      entities: [vouchers],
    });

    expect(vouchers.fetchPage.mock.calls.at(-1)?.[2]).toEqual(
      new Date(Date.parse('2026-01-05T10:00:00Z') - SYNC_OVERLAP_MS),
    );
    expect(result.entities[0]).toMatchObject({
      mode: 'incremental',
      inserted: 1,
      unchanged: 1,
      deleted: 0,
    });
    expect(store.syncState('vouchers')).toEqual({
      watermark: '2026-01-11T08:00:00.000Z',
      lastFullSync: t0.toISOString(),
      lastSync: t1.toISOString(),
    });
  });

  it('never marks records deleted in an incremental sync', async () => {
    let rows = [
      record('1', '2026-01-05T10:00:00Z'),
      record('2', '2026-01-05T10:00:00Z'),
    ];
    const vouchers = entity('vouchers', () => rows);
    await syncStore(client, store, { now: t0, entities: [vouchers] });

    rows = [];
    const result = await syncStore(client, store, {
      now: new Date('2026-01-11T00:00:00Z'),
      entities: [vouchers],
    });

    expect(result.entities[0]).toMatchObject({
      mode: 'incremental',
      deleted: 0,
    });
    expect(store.records('vouchers')).toHaveLength(2);
  });

  it('marks records deleted that a full sync no longer sees', async () => {
    let rows = [
      record('1', '2026-01-05T10:00:00Z'),
      record('2', '2026-01-05T10:00:00Z'),
    ];
    const vouchers = entity('vouchers', () => rows);
    await syncStore(client, store, { now: t0, entities: [vouchers] });

    rows = [record('1', '2026-01-05T10:00:00Z')];
    const result = await syncStore(client, store, {
      now: new Date('2026-01-11T00:00:00Z'),
      entities: [vouchers],
      full: true,
    });

    expect(result.entities[0]).toMatchObject({ mode: 'full', deleted: 1 });
    expect(store.records<StoredRecord>('vouchers').map((r) => r.id)).toEqual([
      '1',
    ]);
    expect(store.record('vouchers', '2')?.deletedAt).not.toBeNull();
  });

  it('always fetches non-incremental entities in full', async () => {
    const tags = entity('tags', () => [{ id: '1' }], false);
    await syncStore(client, store, { now: t0, entities: [tags] });
    const result = await syncStore(client, store, {
      now: new Date('2026-01-11T00:00:00Z'),
      entities: [tags],
    });
    expect(result.entities[0]?.mode).toBe('full');
    expect(
      tags.fetchPage.mock.calls.every((call) => call[2] === undefined),
    ).toBe(true);
  });

  it('falls back to a full sync once the last one is a week old', async () => {
    const vouchers = entity('vouchers', () => [
      record('1', '2026-01-05T10:00:00Z'),
    ]);
    await syncStore(client, store, { now: t0, entities: [vouchers] });
    const result = await syncStore(client, store, {
      now: new Date(t0.getTime() + FULL_SYNC_INTERVAL_MS),
      entities: [vouchers],
    });
    expect(result.entities[0]?.mode).toBe('full');
  });

  it('skips entities the token may not read', async () => {
    const parts = entity('parts', () => []);
    parts.fetchPage.mockRejectedValue(
      new SevDeskError({
        status: 403,
        statusText: 'Forbidden',
        body: { error: { message: 'ACME denied' } },
      }),
    );
    const tags = entity('tags', () => [{ id: '1' }], false);

    const result = await syncStore(client, store, {
      now: t0,
      entities: [parts, tags],
    });

    expect(result.skipped).toEqual(['parts']);
    expect(result.entities.map((e) => e.entity)).toEqual(['tags']);
    expect(store.syncState('parts')).toBeNull();
  });

  it('writes nothing when a request fails', async () => {
    const tags = entity('tags', () => [{ id: '1' }], false);
    const vouchers = entity('vouchers', () => []);
    vouchers.fetchPage.mockRejectedValue(
      new SevDeskError({
        status: 500,
        statusText: 'Server Error',
        body: { error: { message: 'ACME down' } },
      }),
    );

    await expect(
      syncStore(client, store, { now: t0, entities: [tags, vouchers] }),
    ).rejects.toThrow('ACME down');
    expect(store.records('tags')).toEqual([]);
    expect(store.getMeta('last_sync')).toBeNull();
  });
});

describe('change log', () => {
  it('logs nothing on the first sync and every change after it', async () => {
    let rows = [
      record('1', '2026-01-05T10:00:00Z'),
      record('2', '2026-01-05T10:00:00Z'),
    ];
    const vouchers = entity('vouchers', () => rows, false);
    await syncStore(client, store, { now: t0, entities: [vouchers] });
    expect(store.changes()).toEqual([]);

    rows = [
      record('1', '2026-01-06T10:00:00Z'),
      record('3', '2026-01-06T10:00:00Z'),
    ];
    await syncStore(client, store, {
      now: new Date('2026-01-11T00:00:00Z'),
      entities: [vouchers],
    });

    expect(
      store
        .changes()
        .map((c) => [c.id, c.kind])
        .sort(),
    ).toEqual([
      ['1', 'updated'],
      ['2', 'deleted'],
      ['3', 'new'],
    ]);
  });
});

describe('ENTITIES', () => {
  it('has unique names and syncs exactly the four entities with an updateAfter filter incrementally', () => {
    const names = ENTITIES.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    expect(ENTITIES.filter((e) => e.incremental).map((e) => e.name)).toEqual([
      'contacts',
      'invoices',
      'orders',
      'vouchers',
    ]);
  });
});
