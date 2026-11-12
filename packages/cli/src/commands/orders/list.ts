import type { Order, OrderStatus } from '@mi-skam/sevdesk-sdk';
import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { changeFilterOptions, changeFilters } from '../../change-filters';
import { requireClient } from '../../client';
import {
  byIdDesc,
  equals,
  inDateRange,
  localList,
  localOption,
  matchesChangeFilters,
  readLocal,
  refersToContact,
} from '../../local';
import { contactLabel, printJson, printTable } from '../../output';
import { fetchAll } from '../../pagination';

export default defineCommand({
  description: 'List orders.',
  options: defineOptions(
    z.object({
      status: z.coerce
        .number()
        .optional()
        .describe(
          'Filter by status: 100 draft, 200 delivered, 300 rejected, 500 accepted, 750 partially calculated, 1000 calculated.',
        ),
      orderNumber: z.string().optional().describe('Filter by order number.'),
      startDate: z
        .string()
        .optional()
        .describe(
          'Only orders on or after this date as dd.mm.yyyy or Unix timestamp.',
        ),
      endDate: z
        .string()
        .optional()
        .describe(
          'Only orders on or before this date as dd.mm.yyyy or Unix timestamp.',
        ),
      contact: z.coerce
        .number()
        .optional()
        .describe('ID of the contact whose orders to list.'),
      ...changeFilterOptions('orders'),
      limit: z.coerce
        .number()
        .optional()
        .describe(
          'Maximum number of orders to return. Defaults to all of them.',
        ),
      offset: z.coerce
        .number()
        .optional()
        .describe('Number of orders to skip.'),
      ...localOption,
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options) => {
    let orders: Order[];
    if (options.local) {
      orders = localList(await readLocal<Order>('orders'), {
        where: (order) =>
          equals(order.status, options.status) &&
          equals(order.orderNumber, options.orderNumber) &&
          inDateRange(order.orderDate, options.startDate, options.endDate) &&
          refersToContact(order.contact, options.contact) &&
          matchesChangeFilters(order, options),
        sort: byIdDesc,
        limit: options.limit,
        offset: options.offset,
      });
    } else {
      const client = await requireClient();
      orders = await fetchAll(
        (page) =>
          client.orders.list({
            status: options.status as OrderStatus | undefined,
            orderNumber: options.orderNumber,
            startDate: options.startDate,
            endDate: options.endDate,
            contactId: options.contact,
            embed: ['contact'],
            ...changeFilters(options),
            ...page,
          }),
        { limit: options.limit, offset: options.offset },
      );
    }
    if (options.json) {
      printJson(orders);
      return;
    }
    if (orders.length === 0) {
      consola.info('No orders found.');
      return;
    }
    printTable(
      orders.map((order) => ({
        id: order.id,
        number: order.orderNumber,
        date: order.orderDate,
        contact: contactLabel(order.contact),
        gross: order.sumGross,
        status: order.status,
      })),
    );
  },
});
