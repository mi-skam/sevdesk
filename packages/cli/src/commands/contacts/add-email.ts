import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { requireStringOption } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Add an e-mail address to a contact.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The contact ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      email: z
        .string()
        .optional()
        .describe('The e-mail address. If omitted, you will be prompted.'),
      key: z.coerce
        .number()
        .default(2)
        .describe(
          'ID of the communication way key: 1 private, 2 work, 7 newsletter, 8 invoicing.',
        ),
      main: z
        .boolean()
        .default(false)
        .describe('Mark the e-mail address as the main one of the contact.'),
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
    const email = await requireStringOption({
      value: options.email,
      requirement: 'an e-mail address via --email',
      question: 'Enter the e-mail address:',
    });
    if (!email.includes('@')) {
      consola.error('The e-mail address must contain an "@".');
      process.exit(1);
    }
    const communicationWay = await client.communicationWays.create({
      contactId,
      type: 'EMAIL',
      value: email,
      keyId: options.key,
      main: options.main,
    });
    if (options.json) {
      printJson(communicationWay);
      return;
    }
    consola.success(`Created e-mail communication way ${communicationWay.id}.`);
  },
});
