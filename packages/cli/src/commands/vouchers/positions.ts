import type { ModelRefResponse, VoucherPosition } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { requireClient } from '../../client';
import {
  byIdAsc,
  localList,
  localOption,
  readLocal,
  refersTo,
} from '../../local';
import { printJson, printTable } from '../../output';
import { fetchAll } from '../../pagination';

/**
 * The booking account of a position. The number and name fields are only
 * present when the reference was inflated with the `embed` query parameter.
 */
interface AccountDatevLike extends ModelRefResponse {
  number?: string | number | null;
  accountNumber?: string | number | null;
  name?: string | null;
  accountName?: string | null;
}

export default defineCommand({
  description: 'List voucher positions.',
  options: defineOptions(
    z.object({
      voucher: z.coerce
        .number()
        .optional()
        .describe('ID of the voucher whose positions to list.'),
      limit: z.coerce
        .number()
        .optional()
        .describe(
          'Maximum number of positions to return. Defaults to all of them.',
        ),
      offset: z.coerce
        .number()
        .optional()
        .describe('Number of positions to skip.'),
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    let positions: VoucherPosition[];
    if (options.local) {
      positions = localList(
        await readLocal<VoucherPosition>('voucher-positions'),
        {
          where: (position) => refersTo(position.voucher, options.voucher),
          sort: byIdAsc,
          limit: options.limit,
          offset: options.offset,
        },
      );
    } else {
      const client = await requireClient();
      positions = await fetchAll(
        (page) =>
          client.vouchers.listPositions({
            voucherId: options.voucher,
            embed: ['accountDatev'],
            ...page,
          }),
        { limit: options.limit, offset: options.offset },
      );
    }
    if (options.json) {
      printJson(positions);
      return;
    }
    if (positions.length === 0) {
      consola.info('No voucher positions found.');
      return;
    }
    printTable(
      positions.map((position) => ({
        id: position.id,
        voucher: position.voucher.id,
        account: accountLabel(position.accountDatev ?? position.accountingType),
        taxRate: position.taxRate,
        net: String(position.net),
        sumNet: position.sumNet,
        sumGross: position.sumGross,
      })),
    );
  },
});

function accountLabel(account: AccountDatevLike | null | undefined): string {
  if (!account) {
    return '-';
  }
  const parts = [
    account.number ?? account.accountNumber,
    account.name ?? account.accountName,
  ].filter((part) => part !== undefined && part !== null && part !== '');
  return parts.length === 0 ? account.id : parts.join(' ');
}
