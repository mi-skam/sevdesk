import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Update an address of a contact.',
  args: z.tuple([
    idArgument
      .optional()
      .describe(
        'The contact address ID, as shown by contacts:get. If omitted, you will be prompted.',
      ),
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
          'ID of the country as a StaticCountry ID, for example 1 for Germany.',
        ),
      category: z.coerce
        .number()
        .optional()
        .describe('ID of the address category.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const fields = {
      street: options.street,
      zip: options.zip,
      city: options.city,
      countryId: options.country,
      categoryId: options.category,
    };
    if (Object.values(fields).every((value) => value === undefined)) {
      consola.error(
        'You must provide at least one of --street, --zip, --city, --country or --category.',
      );
      process.exit(1);
    }
    const client = await requireClient();
    const contactAddressId = await requireIdArgument({
      value: targetId,
      requirement: 'a contact address ID as a positional argument',
      question: 'Enter the contact address ID:',
    });
    const address = await client.contactAddresses.update({
      contactAddressId,
      ...fields,
    });
    if (options.json) {
      printJson(address);
      return;
    }
    consola.success(`Updated contact address ${address.id}.`);
  },
});
