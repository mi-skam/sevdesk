import { existsSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databasePath, isoTimestamp, Store, withStore } from '../src/store';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sevdesk-store-'));
  path = join(dir, 'nested', 'sevdesk.db');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

const t0 = new Date('2026-01-01T00:00:00Z');
const t1 = new Date('2026-01-02T00:00:00Z');

function voucher(id: string, update: string, description = 'RE-1') {
  return {
    id,
    objectName: 'Voucher',
    create: '2025-12-31T10:00:00+01:00',
    update,
    description,
  };
}

describe('databasePath', () => {
  it('prefers SEVDESK_DB', () => {
    vi.stubEnv('SEVDESK_DB', '/tmp/acme.db');
    expect(databasePath()).toBe('/tmp/acme.db');
  });

  it('falls back to XDG_DATA_HOME', () => {
    vi.stubEnv('SEVDESK_DB', '');
    vi.stubEnv('XDG_DATA_HOME', '/data');
    expect(databasePath()).toBe('/data/sevdesk/sevdesk.db');
  });
});

describe('isoTimestamp', () => {
  it('normalizes offsets to UTC', () => {
    expect(isoTimestamp('2026-01-01T10:00:00+01:00')).toBe(
      '2026-01-01T09:00:00.000Z',
    );
  });

  it('returns null for missing or unparseable values', () => {
    expect(isoTimestamp(null)).toBeNull();
    expect(isoTimestamp(undefined)).toBeNull();
    expect(isoTimestamp('soon')).toBeNull();
  });
});

describe('Store', () => {
  it('refuses to create a database for read commands', async () => {
    await expect(Store.open({ create: false, path })).rejects.toThrow(
      'Run `sevdesk db:sync` first.',
    );
    expect(existsSync(path)).toBe(false);
  });

  it('creates the database with mode 0600', async () => {
    await withStore({ create: true, path }, () => undefined);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('inserts, updates and skips unchanged records', async () => {
    await withStore({ create: true, path }, (store) => {
      expect(
        store.upsert(
          'vouchers',
          [
            voucher('2', '2026-01-01T10:00:00+01:00'),
            voucher('10', '2026-01-01T11:00:00+01:00'),
          ],
          t0,
        ),
      ).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
      expect(
        store.upsert(
          'vouchers',
          [
            voucher('2', '2026-01-01T10:00:00+01:00'),
            voucher('10', '2026-01-02T11:00:00+01:00', 'RE-2'),
          ],
          t1,
        ),
      ).toEqual({ inserted: 0, updated: 1, unchanged: 1 });
      expect(
        store
          .records<{ id: string; description: string }>('vouchers')
          .map((v) => [v.id, v.description]),
      ).toEqual([
        ['2', 'RE-1'],
        ['10', 'RE-2'],
      ]);
    });
  });

  it('keeps entities apart', async () => {
    await withStore({ create: true, path }, (store) => {
      store.upsert('vouchers', [voucher('1', '2026-01-01T10:00:00Z')], t0);
      store.upsert('invoices', [{ id: '1', objectName: 'Invoice' }], t0);
      expect(store.records('vouchers')).toHaveLength(1);
      expect(store.records('invoices')).toEqual([
        { id: '1', objectName: 'Invoice' },
      ]);
    });
  });

  it('marks missing records deleted and restores them when seen again', async () => {
    await withStore({ create: true, path }, (store) => {
      store.upsert(
        'vouchers',
        [
          voucher('1', '2026-01-01T10:00:00Z'),
          voucher('2', '2026-01-01T10:00:00Z'),
        ],
        t0,
      );
      expect(store.markMissingDeleted('vouchers', new Set(['1']), t1)).toBe(1);
      expect(
        store.records<{ id: string }>('vouchers').map((v) => v.id),
      ).toEqual(['1']);
      expect(store.records('vouchers', { includeDeleted: true })).toHaveLength(
        2,
      );
      expect(store.record('vouchers', '2')?.deletedAt).toBe(t1.toISOString());
      // Already deleted records are not counted again.
      expect(store.markMissingDeleted('vouchers', new Set(['1']), t1)).toBe(0);

      expect(
        store.upsert('vouchers', [voucher('2', '2026-01-01T10:00:00Z')], t1),
      ).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
      expect(store.record('vouchers', '2')?.deletedAt).toBeNull();
    });
  });

  it('returns null for an unknown record', async () => {
    await withStore({ create: true, path }, (store) => {
      expect(store.record('vouchers', '404')).toBeNull();
    });
  });

  it('round-trips the sync state', async () => {
    await withStore({ create: true, path }, (store) => {
      expect(store.syncState('vouchers')).toBeNull();
      const state = {
        watermark: '2026-01-01T00:00:00.000Z',
        lastFullSync: null,
        lastSync: '2026-01-02T00:00:00.000Z',
      };
      store.setSyncState('vouchers', state);
      expect(store.syncState('vouchers')).toEqual(state);
    });
  });

  it('rolls back a failed transaction', async () => {
    await withStore({ create: true, path }, (store) => {
      expect(() =>
        store.transaction(() => {
          store.upsert('vouchers', [voucher('1', '2026-01-01T10:00:00Z')], t0);
          throw new Error('ACME failure');
        }),
      ).toThrow('ACME failure');
      expect(store.records('vouchers')).toEqual([]);
    });
  });

  it('reports counts per synced entity', async () => {
    await withStore({ create: true, path }, async (store) => {
      store.upsert(
        'vouchers',
        [
          voucher('1', '2026-01-01T10:00:00Z'),
          voucher('2', '2026-01-01T10:00:00Z'),
        ],
        t0,
      );
      store.markMissingDeleted('vouchers', new Set(['1']), t1);
      store.setSyncState('vouchers', {
        watermark: null,
        lastFullSync: t1.toISOString(),
        lastSync: t1.toISOString(),
      });
      store.setSyncState('tags', {
        watermark: null,
        lastFullSync: t1.toISOString(),
        lastSync: t1.toISOString(),
      });
      store.setMeta('last_sync', t1.toISOString());
      const info = await store.info();
      expect(info.path).toBe(path);
      expect(info.bytes).toBeGreaterThan(0);
      expect(info.lastSync).toBe(t1.toISOString());
      expect(info.entities).toEqual([
        {
          entity: 'tags',
          records: 0,
          deleted: 0,
          lastSync: t1.toISOString(),
          lastFullSync: t1.toISOString(),
        },
        {
          entity: 'vouchers',
          records: 1,
          deleted: 1,
          lastSync: t1.toISOString(),
          lastFullSync: t1.toISOString(),
        },
      ]);
    });
  });

  it('refuses a database from a newer version', async () => {
    await withStore({ create: true, path }, () => undefined);
    const { DatabaseSync } = await import('node:sqlite');
    const raw = new DatabaseSync(path);
    raw.exec('PRAGMA user_version = 99');
    raw.close();
    await expect(Store.open({ create: false, path })).rejects.toThrow(
      'created by a newer sevdesk version',
    );
  });
});
