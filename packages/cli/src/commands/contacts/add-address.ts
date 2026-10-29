import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { requireNumberOption } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Add an address to a contact.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The contact ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      street: z.string().optional().describe('Street and house number.'),
      zip: z.string().optional().describe('Zip code.'),
      city: z.string().optional().describe('City name.'),
      country: z.coerce
        .number()
        .optional()
        .describe(
          'ID of the country as a StaticCountry ID, for example 1 for Germany. There is no lookup endpoint in this CLI, but an existing address of a contact reveals the IDs of other countries. If omitted, you will be prompted.',
        ),
      category: z.coerce
        .number()
        .optional()
        .describe(
          'ID of the address category. The sevdesk API does not document the IDs, they are listed by a GET to /Category?objectType=ContactAddress and an existing address of a contact reveals the ones in use. If omitted, you will be prompted.',
        ),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const client = await requireClient();
    const contactId = await requireIdArgument({
      value: targetId,
      requirement: 'a contact ID as a positional argument',
      question: 'Enter the contact ID:',
    });
    const countryId = await requireNumberOption({
      value: options.country,
      requirement: 'a country ID via --country',
      question: 'Enter the country ID, for example 1 for Germany:',
    });
    const categoryId = await requireNumberOption({
      value: options.category,
      requirement: 'an address category ID via --category',
      question: 'Enter the address category ID:',
    });
    const address = await client.contactAddresses.create({
      contactId,
      countryId,
      categoryId,
      street: options.street,
      zip: options.zip,
      city: options.city,
    });
    if (options.json) {
      printJson(address);
      return;
    }
    consola.success(`Created contact address ${address.id}.`);
  },
});
