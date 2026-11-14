import { consola } from 'consola';
import { z } from 'zod';
import { defineCommand, defineOptions } from 'zodline';
import { commands } from '../commands';
import { McpServer } from '../mcp/protocol';
import { buildTools } from '../mcp/tools';
import { pkg } from '../package';

const INSTRUCTIONS = `Tools for a sevdesk accounting account (bookkeeping system 2.0), one per CLI command (vouchers_list = \`sevdesk vouchers:list\`). Results are the CLI's JSON output, slimmed: every scalar is a string, ids included; fields that are null are left out, HTML texts come as plain text, and a contact embedded in another record keeps only its id, name and customer number (contacts_get has the full contact).

- Prefer \`local: true\` on list/get tools: it answers from the local database without API requests. Run db_sync first when the database is missing or stale (db_info shows the last sync); db_history shows what syncs found changed.
- List tools return all matching records unless \`limit\` is set. A result that would be too long is cut to the records that fit, with a note on how to page or filter for the rest; prefer filters and \`limit\` on large accounts.
- db_history lists what changed (\`changes\`); fetch the current record with the matching get tool.
- Write tools exist only when the server runs with --allow-writes. Most create drafts and contacts only: vouchers_create always creates a draft (status 50). Booking, enshrining and deleting are not available.
- invoices_cancel and invoices_send are the exception and cannot be undone. invoices_cancel creates a cancellation invoice (Stornorechnung) and closes an open, unpaid invoice; invoices_send emails and finalises a draft, or emails an unsent cancellation invoice, from a delivery JSON file ({ "delivery": { "to", "subject", "message", "cc"?, "bcc"?, "copyToSelf"? } }, \`{{number}}\` becomes the invoice number). Both cannot be undone: get the user's approval of the invoice, the recipient and the text before calling them.`;

export default defineCommand({
  description:
    'Run a Model Context Protocol server on stdin/stdout that offers the read commands as tools, for Claude Code and other MCP clients. Register it with `claude mcp add sevdesk -- sevdesk mcp`.',
  options: defineOptions(
    z.object({
      allowWrites: z
        .boolean()
        .default(false)
        .describe(
          'Also offer write tools: draft vouchers and invoices, contacts with their addresses, e-mails and phone numbers, and tags, plus invoices_cancel and invoices_send, which cancel an invoice and email invoices to customers and cannot be undone. Never booking or deleting.',
        ),
    }),
  ),
  action: async (options) => {
    // stdout carries the protocol; anything else goes to stderr.
    console.log = (...values: unknown[]) => {
      console.error(...values);
    };
    consola.options.stdout = process.stderr;
    const tools = buildTools(commands, { allowWrites: options.allowWrites });
    const server = new McpServer(
      { name: 'sevdesk', version: pkg.version, instructions: INSTRUCTIONS },
      tools,
    );
    consola.info(
      `sevdesk MCP server ${pkg.version}: ${tools.length} tools${options.allowWrites ? ', writes allowed' : ', read-only'}.`,
    );
    await server.serveStdio();
  },
});
