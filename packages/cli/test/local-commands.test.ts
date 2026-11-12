import { consola } from 'consola';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import contactsGet from '../src/commands/contacts/get';
import contactsList from '../src/commands/contacts/list';
import invoicesList from '../src/commands/invoices/list';
import quotesList from '../src/commands/quotes/list';
import transactionsList from '../src/commands/transactions/list';
import vouchersGet from '../src/commands/vouchers/get';
import vouchersList from '../src/commands/vouchers/list';
import { withStore } from '../src/store';

const acme = {
  id: '7',
  objectName: 'Contact',
  name: 'ACME GmbH',
  parent: null,
};
const jane = {
  id: '9',
  objectName: 'Contact',
  name: null,
  surename: 'Jane',
  familyname: 'Doe',
  parent: { id: '7', objectName: 'Contact' },
};

function voucher(id: string, voucherDate: string, extra: object = {}) {
  return {
    id,
    objectName: 'Voucher',
    create: '2026-01-01T10:00:00+01:00',
    update: '2026-01-02T10:00:00+01:00',
    voucherDate,
    status: '100',
    creditDebit: 'C',
    description: `RE-${id}`,
    supplier: acme,
    sumGross: '119',
    ...extra,
  };
}

function invoice(id: string, invoiceType: string, contact: object = acme) {
  return {
    id,
    objectName: 'Invoice',
    create: '2026-01-01T10:00:00+01:00',
    update: '2026-01-02T10:00:00+01:00',
    invoiceDate: '2026-01-10T00:00:00+01:00',
    invoiceNumber: `RE-${id}`,
    invoiceType,
    status: '200',
    contact,
    sumGross: '119',
  };
}

const fetchMock = vi.fn();
let dir: string;
let log: ReturnType<typeof vi.spyOn>;

async function seed(entities: Record<string, Array<{ id: string }>>) {
  await withStore({ create: true }, (store) => {
    for (const [entity, records] of Object.entries(entities)) {
      store.upsert(entity, records, new Date('2026-01-03T00:00:00Z'));
    }
  });
}

function printed(): unknown {
  return JSON.parse(log.mock.calls.at(-1)?.[0] as string);
}

function ids(value: unknown): string[] {
  return (value as Array<{ id: string }>).map((record) => record.id);
}

describe('--local', () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sevdesk-local-'));
    fetchMock.mockReset();
    // No token: local reads must not need one.
    vi.stubEnv('SEVDESK_TOKEN', '');
    vi.stubEnv('XDG_CONFIG_HOME', dir);
    vi.stubEnv('SEVDESK_DB', join(dir, 'sevdesk.db'));
    vi.stubGlobal('fetch', fetchMock);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('fails with a hint when there is no database', async () => {
    await expect(
      vouchersList.action({ local: true, json: true }, undefined),
    ).rejects.toThrow('Run `sevdesk db:sync` first.');
  });

  it('lists vouchers newest first and applies filters, offset and limit', async () => {
    await seed({
      vouchers: [
        voucher('1', '2026-01-01T00:00:00+01:00'),
        voucher('2', '2026-01-03T00:00:00+01:00', { status: '1000' }),
        voucher('3', '2026-01-02T00:00:00+01:00'),
        voucher('4', '2026-01-02T00:00:00+01:00', { supplier: jane }),
      ],
    });

    await vouchersList.action({ local: true, json: true }, undefined);
    expect(ids(printed())).toEqual(['2', '4', '3', '1']);

    await vouchersList.action(
      { local: true, json: true, status: 100, offset: 1, limit: 1 },
      undefined,
    );
    expect(ids(printed())).toEqual(['3']);

    // The organization filter also matches its persons.
    await vouchersList.action(
      { local: true, json: true, contact: 7, descriptionLike: 're-4' },
      undefined,
    );
    expect(ids(printed())).toEqual(['4']);

    // An instant end date is exclusive for vouchers, a calendar day is not.
    const midnight = String(Date.parse('2026-01-02T00:00:00+01:00') / 1000);
    await vouchersList.action(
      { local: true, json: true, endDate: midnight },
      undefined,
    );
    expect(ids(printed())).toEqual(['1']);
    await vouchersList.action(
      { local: true, json: true, endDate: '02.01.2026' },
      undefined,
    );
    expect(ids(printed())).toEqual(['4', '3', '1']);
  });

  it('hides reminders and recurring invoices like the API without showAll', async () => {
    await seed({
      invoices: [
        invoice('1', 'RE'),
        invoice('2', 'MA'),
        invoice('3', 'WKR'),
        invoice('4', 'SR', jane),
      ],
    });

    await invoicesList.action({ local: true, json: true }, undefined);
    expect(ids(printed())).toEqual(['4', '1']);

    await invoicesList.action(
      { local: true, json: true, contact: 9 },
      undefined,
    );
    expect(ids(printed())).toEqual(['4']);
  });

  it('lists organizations only unless depth is 1', async () => {
    await seed({ contacts: [acme, jane] });

    await contactsList.action({ local: true, json: true }, undefined);
    expect(ids(printed())).toEqual(['7']);

    await contactsList.action(
      { local: true, json: true, depth: 1, name: 'doe' },
      undefined,
    );
    expect(ids(printed())).toEqual(['9']);
  });

  it('keeps only quotes and returns their contact unembedded', async () => {
    await seed({
      orders: [
        { id: '1', objectName: 'Order', orderType: 'AN', contact: acme },
        { id: '2', objectName: 'Order', orderType: 'AB', contact: acme },
      ],
    });

    await quotesList.action({ local: true, json: true }, undefined);
    expect(printed()).toEqual([
      {
        id: '1',
        objectName: 'Order',
        orderType: 'AN',
        contact: { id: '7', objectName: 'Contact' },
      },
    ]);
  });

  it('filters unbooked transactions after the offset, like the live command', async () => {
    const transaction = (id: string, status: string) => ({
      id,
      objectName: 'CheckAccountTransaction',
      valueDate: `2026-01-0${id}T00:00:00+01:00`,
      status,
      amount: '-10',
      payeePayerName: 'ACME GmbH',
      paymtPurpose: `RE-${id}`,
      checkAccount: { id: '5', objectName: 'CheckAccount' },
    });
    await seed({
      transactions: [
        transaction('1', '100'),
        transaction('2', '400'),
        transaction('3', '100'),
        transaction('4', '100'),
      ],
    });

    await transactionsList.action(
      { local: true, json: true, unbooked: true, offset: 1 },
      undefined,
    );
    // Newest first: 4, 3, 2, 1; offset 1 skips 4; keep drops 2.
    expect(ids(printed())).toEqual(['3', '1']);
  });

  it('shows a deleted record with a warning', async () => {
    await seed({ vouchers: [voucher('1', '2026-01-01T00:00:00+01:00')] });
    await withStore({ create: false }, (store) =>
      store.markMissingDeleted(
        'vouchers',
        new Set(),
        new Date('2026-01-04T00:00:00Z'),
      ),
    );
    const warn = vi.spyOn(consola, 'warn').mockImplementation(() => {});

    await vouchersGet.action({ local: true, json: true }, [1]);

    expect(ids([printed()])).toEqual(['1']);
    expect(warn).toHaveBeenCalledWith(
      'Voucher 1 was deleted in sevdesk; showing the copy from before 2026-01-04T00:00:00.000Z.',
    );
  });

  it('fails for a record that was never synced', async () => {
    await seed({ vouchers: [] });
    await expect(
      vouchersGet.action({ local: true, json: true }, [404]),
    ).rejects.toThrow('Voucher 404 is not in the local database.');
  });

  it('shows a contact with its own addresses and communication ways', async () => {
    await seed({
      contacts: [acme, jane],
      'contact-addresses': [
        {
          id: '1',
          contact: { id: '7', objectName: 'Contact' },
          city: 'Berlin',
        },
        {
          id: '2',
          contact: { id: '9', objectName: 'Contact' },
          city: 'Hamburg',
        },
      ],
      'communication-ways': [
        { id: '3', contact: { id: '7', objectName: 'Contact' }, type: 'EMAIL' },
      ],
    });

    await contactsGet.action({ local: true, json: true }, [7]);

    const output = printed() as {
      contact: { id: string };
      addresses: Array<{ id: string }>;
      communicationWays: Array<{ id: string }>;
    };
    expect(output.contact.id).toBe('7');
    expect(ids(output.addresses)).toEqual(['1']);
    expect(ids(output.communicationWays)).toEqual(['3']);
  });
});
