# sevdesk

[![CI](https://github.com/mi-skam/sevdesk/actions/workflows/ci.yml/badge.svg)](https://github.com/mi-skam/sevdesk/actions/workflows/ci.yml)
[![npm sdk](https://img.shields.io/npm/v/%40genz-its%2Fsevdesk-sdk?label=sdk)](https://www.npmjs.com/package/@genz-its/sevdesk-sdk)
[![npm cli](https://img.shields.io/npm/v/%40genz-its%2Fsevdesk-cli?label=cli)](https://www.npmjs.com/package/@genz-its/sevdesk-cli)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

Unofficial Node.js SDK and CLI for the [sevdesk](https://sevdesk.de/) API.[^1]

## Packages

| Package                                    | Description                                    |
| ------------------------------------------ | ---------------------------------------------- |
| [`@genz-its/sevdesk-sdk`](./packages/sdk/) | Unofficial Node.js SDK for the sevdesk API.    |
| [`@genz-its/sevdesk-cli`](./packages/cli/) | Unofficial command-line interface for sevdesk. |

## Fork status

This is an independent fork of [genz-its/sevdesk](https://github.com/genz-its/sevdesk). The npm badges and package names above refer to the upstream packages; this fork has not published an npm release. Installing those packages from the registry does **not** install the fork's changes.

The changes are organized in two stacked pull requests: [invoice creation, numbering, and positional CLI inputs](https://github.com/mi-skam/sevdesk/pull/1), followed by [complete quote workflows](https://github.com/mi-skam/sevdesk/pull/2).

## Features

- **Draft invoices (Rechnungsentwürfe):** validated JSON input, multiple line items, explicit pricing and tax settings, and offline previews. Creation never sends or finalizes an invoice.
- **Quotes (Angebote):** a shared structured JSON model and interactive editor, customer selection, editable positions, local import/export, draft saving, PDF previews, and explicit sending.
- **Document numbering (Nummernkreise):** inspect configured formats and suggest the next unused number, including existing drafts. Suggestions are **not reservations**; duplicate checks are not atomic.
- **Recovery (Wiederherstellung):** private quote snapshots and operation receipts preserve local work and identify uncertain creation or sending outcomes. Unknown outcomes never trigger automatic recreation or resending.
- **Accounting workflows:** receipt uploads (Belege), bank transactions, payment booking, contacts, account lookups, and DATEV/CSV exports through the SDK.

Account-specific defaults are not inferred from historical documents. Quote totals are indicative; sevdesk remains authoritative.

## Getting started

Node.js 22 or later and a sevdesk account on bookkeeping system version 2.0 are required for account operations. Offline previews do not require authentication.

### Run this fork from source

Until the pull requests merge, use the complete feature branch:

```bash
git clone --branch feat/quote-workflows https://github.com/mi-skam/sevdesk.git
cd sevdesk
npm ci
npm run build

node packages/cli/dist/index.js --help
```

Examples from the repository root:

```bash
# Validate and preview a draft invoice offline; does not create it
node packages/cli/dist/index.js invoices:create invoice.json --dry-run --json

# Preview the invented quote example offline; does not save or send
node packages/cli/dist/index.js quotes:create packages/cli/examples/quote.example.json --dry-run --json

# Start the interactive quote editor; remote saving/sending requires confirmation
node packages/cli/dist/index.js quotes:create

# Inspect an existing invoice and its positions (requires authentication)
node packages/cli/dist/index.js invoices:get 42 --positions --json

# Inspect quote numbering without reserving a number (requires authentication)
node packages/cli/dist/index.js numbering:get --kind quote --suggest --json
```

Use `node packages/cli/dist/index.js login` to configure authentication for account operations, or supply `SEVDESK_TOKEN` through your environment. Never commit credentials.

See the [SDK documentation](./packages/sdk/README.md), [CLI command reference](./packages/cli/README.md), [invoice JSON format](./packages/cli/README.md#invoicescreate), and [quote workflow and JSON reference](./packages/cli/docs/quotes.md) for details.

### CLI argument conventions

Primary files and target IDs are positional and precede options:

```bash
sevdesk invoices:create invoice.json --dry-run --json
sevdesk invoices:get 42 --positions --json
sevdesk vouchers:create receipt.pdf --supplier-name "ACME GmbH" --amount 119 --tax-rule 9 --account-datev 26
sevdesk quotes:pdf 42 --output quote.pdf --json
sevdesk quotes:send 42 quote.json --dry-run --json
```

These examples use the `sevdesk` command name; when running from source, substitute `node packages/cli/dist/index.js` as above. Creating a voucher uploads the receipt and creates a remote record; it is **not** a preview.

**Breaking change:** target `--id`, `contacts:add-* --contact`, and `vouchers:create --file` flags have been removed **without compatibility aliases**. Update existing scripts accordingly. IDs must be positive safe integers. Existing interactive prompts remain available when their positional input is omitted; non-interactive calls must supply required inputs.

Filters such as `invoices:list --contact 7`, relationship settings such as `--check-account` and `--transaction`, and destinations such as `--output` remain named options. JSON output shapes, exit codes, and existing write confirmations are unchanged.

### Upstream npm packages

For the published upstream versions, rather than this fork's feature branch:

```bash
npm install @genz-its/sevdesk-sdk
# Or install the upstream CLI globally
npm install -g @genz-its/sevdesk-cli
```

Consult the upstream documentation for the syntax supported by those releases.

## Guides

- [Automation Guide](./docs/automation-guide.md) — Build an automated voucher workflow on top of the CLI.
- [Quote Guide](./packages/cli/docs/quotes.md) — Edit, validate, save, send, and recover quotes (Angebote).

## Development

```bash
npm ci
npm run build
npm run lint
npm run typecheck
npm test
npm run test:terminal
```

Unit tests use mocked API calls. The terminal suite requires Python 3 on macOS/Linux and exercises the real prompt renderer with fake credentials, temporary state, and mocked HTTP. It does not create live documents or send real emails. CI runs on Node.js 22 and 24.

The [official OpenAPI specification](https://api.sevdesk.de/openapi.yaml) serves as a local development reference:

```bash
curl -fsSL https://api.sevdesk.de/openapi.yaml -o openapi.yaml
```

## License

See [LICENSE](./LICENSE).

[^1]: This project is not affiliated with, endorsed by, sponsored by, or approved by sevDesk GmbH or any of their affiliates or subsidiaries.
