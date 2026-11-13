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
    content.push({ type: 'text', text: output.join('\n') });
  }
  if (notes.length > 0) {
    content.push({ type: 'text', text: notes.join('\n') });
  }
  if (content.length === 0) {
    content.push({ type: 'text', text: failed ? 'Failed.' : 'Done.' });
  }
  return failed ? { content, isError: true } : { content };
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
        return runCommand(command, commandOptions, args);
      },
    });
  }
  return tools;
}
