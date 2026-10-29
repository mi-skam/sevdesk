import { z } from 'zod';
import { requireNumberOption } from './options';

/** IDs identify one existing resource; filters and relationship options stay named. */
export const idArgument = z.coerce.number().int().positive();

/** Validate both positional input and the existing interactive ID prompt. */
export async function requireIdArgument(
  options: Parameters<typeof requireNumberOption>[0],
): Promise<number> {
  return idArgument.parse(await requireNumberOption(options));
}
