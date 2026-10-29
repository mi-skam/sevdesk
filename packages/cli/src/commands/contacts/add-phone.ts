import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { requireStringOption } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Add a phone number to a contact.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The contact ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      phone: z
        .string()
        .optional()
        .describe('The phone number. If omitted, you will be prompted.'),
      key: z.coerce
        .number()
        .default(2)
        .describe(
          'ID of the communication way key: 1 private, 2 work, 3 fax, 4 mobile.',
        ),
      main: z
        .boolean()
        .default(false)
        .describe('Mark the phone number as the main one of the contact.'),
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
    const phone = await requireStringOption({
      value: options.phone,
      requirement: 'a phone number via --phone',
      question: 'Enter the phone number:',
    });
    const communicationWay = await client.communicationWays.create({
      contactId,
      type: 'PHONE',
      value: phone,
      keyId: options.key,
      main: options.main,
    });
    if (options.json) {
      printJson(communicationWay);
      return;
    }
    consola.success(`Created phone communication way ${communicationWay.id}.`);
  },
});
