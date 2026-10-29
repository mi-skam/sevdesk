import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { idArgument, requireIdArgument } from '../../arguments';
import { requireClient } from '../../client';
import { confirmOrAbort } from '../../options';
import { printJson } from '../../output';

export default defineCommand({
  description: 'Delete a tag.',
  args: z.tuple([
    idArgument
      .optional()
      .describe('The tag ID. If omitted, you will be prompted.'),
  ]),
  options: defineOptions(
    z.object({
      yes: z.boolean().default(false).describe('Skip the confirmation prompt.'),
      json: z.boolean().default(false).describe('Output in JSON format.'),
    }),
  ),
  action: async (options, [targetId]) => {
    const client = await requireClient();
    const tagId = await requireIdArgument({
      value: targetId,
      requirement: 'a tag ID as a positional argument',
      question: 'Enter the tag ID:',
    });
    const confirmed = await confirmOrAbort({
      message: `Delete tag ${tagId}?`,
      yes: options.yes,
      initial: false,
    });
    if (!confirmed) {
      return;
    }
    await client.tags.delete({ tagId });
    if (options.json) {
      printJson({ deleted: true });
      return;
    }
    consola.success('Tag deleted.');
  },
});
