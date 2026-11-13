import { consola, type ConsolaReporter } from 'consola';
import { z } from 'zod';
import { formatError } from '../errors';
import type { Tool, ToolAnnotations, ToolResult } from './protocol';

/** The parts of a zodline command the server uses; any command fits. */
export interface Command {
  description?: string;
  options?: { schema: z.ZodObject };
  args?: z.ZodType;
  action: (options: never, args: never) => void | Promise<void>;
}

type Action = (options: unknown, args: unknown) => void | Promise<void>;

/**
 * Commands that only read: from sevdesk, or from the local database. All
 * `:list` and `:get` commands count as reads as well.
 */
const READS = new Set([
  'accounts:balance',
  'contact-field-settings:usage',
  'db:history',
  'db:info',
  'doctor',
  'guidance:accounts',
  'layouts:letterpapers',
  'layouts:templates',
  'numbering:get',
  'placeholders:list',
  'vouchers:positions',
]);

/** Reads from sevdesk, but writes the local database. */
const LOCAL_WRITES = new Set(['db:sync']);

/**
 * Commands that only create new records in a state that changes nothing
 * booked: draft vouchers and invoices, contacts and their details, tags.
 * Offered only with `--allow-writes`. Everything that books, enshrines,
 * sends, deletes, edits existing records or writes files stays CLI-only.
 */
const DRAFT_WRITES = new Set([
  'contacts:add-address',
  'contacts:add-email',
  'contacts:add-phone',
  'contacts:create',
  'invoices:create',
  'tags:create',
  'vouchers:create',
]);

/** Options whose value the server fixes for a tool instead of the caller. */
const FIXED: Record<string, Record<string, unknown>> = {
  // A voucher created through MCP stays an editable draft.
  'vouchers:create': { status: 'draft' },
};

/** Names for positional arguments that are not a record ID. */
const ARGUMENT_NAMES: Record<string, string[]> = {
  'db:history': ['entity', 'id'],
  'invoices:create': ['file'],
  'vouchers:create': ['file'],
};

/**
 * Fields left out of a tool's result: Base64 thumbnails, PDFs and template
 * HTML, which make `layouts:templates` over 20 MB and mean nothing to a model.
 */
const OMITTED_FIELDS: Record<string, string[]> = {
  // Two full copies of the record per entry; `changes` summarizes them and
  // the get tool returns the current record.
  'db:history': ['previous', 'data'],
  'layouts:letterpapers': ['img', 'pdf'],
  'layouts:templates': ['img', 'html'],
};

/**
 * The largest result text a tool returns. Claude Code rejects results over
 * 25,000 tokens by default and counts the JSON-escaped text; a cut list of
 * 80,000 characters still came to 89,000 there, so stay well below. A longer list is cut to the
 * records that fit, with a note on how to page.
 */
export const MAX_RESULT_LENGTH = 40_000;

/**
 * Compacts JSON output (the CLI indents it), drops `omit` fields from each
 * record and cuts an array that is too long. Non-JSON output is cut as text.
 */
export function shapeOutput(
  text: string,
  omit: readonly string[] = [],
  maxLength = MAX_RESULT_LENGTH,
  hint = 'Narrow the query with filters.',
): { text: string; note?: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return text.length > maxLength
      ? {
          text: text.slice(0, maxLength),
          note: `Output cut at ${maxLength} of ${text.length} characters.`,
        }
      : { text };
  }
  const strip = (record: unknown): unknown => {
    if (omit.length === 0 || typeof record !== 'object' || record === null) {
      return record;
    }
    const copy = { ...(record as Record<string, unknown>) };
    for (const field of omit) {
      delete copy[field];
    }
    return copy;
  };
  const shaped = Array.isArray(value) ? value.map(strip) : strip(value);
  const compact = JSON.stringify(shaped);
  if (compact.length <= maxLength || !Array.isArray(shaped)) {
    return compact.length <= maxLength
      ? { text: compact }
      : {
          text: compact.slice(0, maxLength),
          note: `Output cut at ${maxLength} of ${compact.length} characters.`,
        };
  }
  // Keep the longest prefix of records that fits.
  let length = 2;
  let count = 0;
  for (const record of shaped) {
    const size = JSON.stringify(record).length + (count > 0 ? 1 : 0);
    if (length + size > maxLength) {
      break;
    }
    length += size;
    count += 1;
  }
  return {
    text: JSON.stringify(shaped.slice(0, count)),
    note: `Showing the first ${count} of ${shaped.length} records; the rest did not fit into one result. ${hint}`,
  };
}

/** Commands whose positional arguments stay optional; for all others they are required. */
const OPTIONAL_ARGUMENTS = new Set(['db:history']);

/** Options every tool sets itself: output is always JSON, and confirmed by the MCP client. */
const HIDDEN_OPTIONS = new Set(['json', 'yes']);

export type ToolKind = 'read' | 'local-write' | 'draft-write';

export function toolKind(name: string): ToolKind | undefined {
  if (name.endsWith(':list') || name.endsWith(':get') || READS.has(name)) {
    return 'read';
  }
  if (LOCAL_WRITES.has(name)) {
    return 'local-write';
  }
  return DRAFT_WRITES.has(name) ? 'draft-write' : undefined;
}

/** `vouchers:list` → `vouchers_list`; MCP tool names allow no colon. */
export function toolName(command: string): string {
  return command.replace(/[^a-zA-Z0-9_-]/g, '_');
}

const ANNOTATIONS: Record<ToolKind, ToolAnnotations> = {
  read: { readOnlyHint: true, openWorldHint: true },
  'local-write': {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  'draft-write': {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

/** Drops the CLI's prompt hint, which does not apply to tool calls. */
function cleanDescription(text: string | undefined): string | undefined {
  return text?.replace(/\s*If omitted, you will be prompted\./g, '').trim();
}

function argumentItems(command: Command): z.ZodType[] {
  const args = command.args as z.ZodType | undefined;
  return args instanceof z.ZodTuple ? (args.def.items as z.ZodType[]) : [];
}

function argumentNames(name: string, command: Command): string[] {
  const items = argumentItems(command);
  const names = ARGUMENT_NAMES[name] ?? (items.length === 1 ? ['id'] : []);
  if (names.length !== items.length) {
    throw new Error(`No MCP argument names for the arguments of ${name}.`);
  }
  return names;
}

/**
 * The tool's input: the command's positional arguments as named properties,
 * then its options, minus `json`, `yes` and fixed ones.
 */
function inputSchema(name: string, command: Command): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  const items = argumentItems(command);
  argumentNames(name, command).forEach((argument, index) => {
    const declared = items[index]!;
    // The CLI prompts for a missing argument; a tool call cannot.
    const item =
      declared instanceof z.ZodOptional && !OPTIONAL_ARGUMENTS.has(name)
        ? (declared.unwrap() as z.ZodType)
        : declared;
    const described = cleanDescription(declared.description);
    shape[argument] = described ? item.describe(described) : item;
  });
  const options = (command.options?.schema as z.ZodObject | undefined)?.shape;
  for (const [key, option] of Object.entries(options ?? {})) {
    if (HIDDEN_OPTIONS.has(key) || key in (FIXED[name] ?? {})) {
      continue;
    }
    shape[key] = option as z.ZodType;
  }
  return z.object(shape);
}

class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

function formatLog(args: unknown[]): string {
  return args
    .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
    .join(' ');
}

/**
 * Runs a command as the CLI would with `--json --yes`, capturing what it
 * prints. `console.log` output is the result; consola messages (warnings,
 * errors) come back as notes. `process.exit` ends the call, not the server.
 */
export async function runCommand(
  command: Command,
  options: Record<string, unknown>,
  args: unknown[],
  shaping: { omit?: readonly string[]; hint?: string } = {},
): Promise<ToolResult> {
  const output: string[] = [];
  const notes: string[] = [];
  const log = console.log;
  const exit = process.exit;
  const exitCode = process.exitCode;
  const reporter: ConsolaReporter = {
    log: (entry) => {
      notes.push(formatLog(entry.args));
    },
  };
  const reporters = consola.options.reporters;
  console.log = (...values: unknown[]) => {
    output.push(formatLog(values));
  };
  process.exit = ((code?: number) => {
    throw new ExitSignal(code ?? 0);
  }) as typeof process.exit;
  consola.setReporters([reporter]);
  process.exitCode = undefined;
  let failed: boolean;
  try {
    await (command.action as Action)(options, args);
    failed = Boolean(process.exitCode);
  } catch (error) {
    if (error instanceof ExitSignal) {
      failed = error.code !== 0;
    } else {
      failed = true;
      notes.push(formatError(error));
    }
  } finally {
    console.log = log;
    process.exit = exit;
    process.exitCode = exitCode;
    consola.setReporters(reporters);
  }
  const content: ToolResult['content'] = [];
  if (output.length > 0) {
    const shaped = shapeOutput(
      output.join('\n'),
      shaping.omit,
      MAX_RESULT_LENGTH,
      shaping.hint,
    );
    content.push({ type: 'text', text: shaped.text });
    if (shaped.note) {
      notes.push(shaped.note);
    }
  }
  if (notes.length > 0) {
    content.push({ type: 'text', text: notes.join('\n') });
  }
  if (content.length === 0) {
    content.push({ type: 'text', text: failed ? 'Failed.' : 'Done.' });
  }
  return failed ? { content, isError: true } : { content };
}

/**
 * A default computed when the server starts, such as today's date, would be
 * advertised long after it went stale; the command computes it per call.
 */
function datelessDefaults(schema: Record<string, unknown>): void {
  const properties = (schema['properties'] ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  for (const property of Object.values(properties)) {
    const value = property['default'];
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      delete property['default'];
      property['description'] =
        `${String(property['description'] ?? '').trim()} Defaults to today.`.trim();
    }
  }
}

/** How to reach the records a cut result left out, given a tool's inputs. */
export function pagingHint(inputs: readonly string[]): string {
  if (inputs.includes('limit') && inputs.includes('offset')) {
    return 'Page with limit and offset, or narrow the query with filters.';
  }
  const filters = inputs.filter(
    (input) => !['limit', 'local', 'id'].includes(input),
  );
  return filters.length > 0
    ? `Narrow the query with ${filters.join(', ')}.`
    : 'This tool cannot page; the result is incomplete.';
}

export function buildTools(
  commands: Record<string, Command>,
  options: { allowWrites: boolean },
): Tool[] {
  const tools: Tool[] = [];
  for (const [name, command] of Object.entries(commands)) {
    const kind = toolKind(name);
    if (!kind || (kind === 'draft-write' && !options.allowWrites)) {
      continue;
    }
    const schema = inputSchema(name, command);
    const names = argumentNames(name, command);
    const jsonSchema = z.toJSONSchema(schema, {
      io: 'input',
      unrepresentable: 'any',
    }) as Record<string, unknown>;
    delete jsonSchema['$schema'];
    datelessDefaults(jsonSchema);
    tools.push({
      name: toolName(name),
      description:
        cleanDescription(command.description) ?? `The ${name} command.`,
      inputSchema: jsonSchema,
      annotations: { title: name, ...ANNOTATIONS[kind] },
      call: async (input) => {
        const required = (jsonSchema['required'] as string[] | undefined) ?? [];
        const missing = required.filter((key) => input[key] === undefined);
        if (missing.length > 0) {
          return {
            content: [
              {
                type: 'text',
                text: `Missing required argument${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`,
              },
            ],
            isError: true,
          };
        }
        const parsed = schema.safeParse(input);
        if (!parsed.success) {
          return {
            content: [{ type: 'text', text: formatError(parsed.error) }],
            isError: true,
          };
        }
        const values = { ...parsed.data } as Record<string, unknown>;
        const args = names.map((argument) => {
          const value = values[argument];
          delete values[argument];
          return value;
        });
        const commandOptions = command.options?.schema
          ? (command.options.schema as z.ZodObject).parse({
              ...values,
              ...FIXED[name],
              json: true,
              ...('yes' in
              ((command.options.schema as z.ZodObject).shape as object)
                ? { yes: true }
                : {}),
            })
          : {};
        return runCommand(command, commandOptions, args, {
          omit: OMITTED_FIELDS[name],
          hint: pagingHint(Object.keys(schema.shape)),
        });
      },
    });
  }
  return tools;
}
