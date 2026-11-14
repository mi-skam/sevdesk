# @mi-skam/sevdesk

Unofficial command-line interface for the [sevdesk](https://sevdesk.de/) API.[^1]

## Features

- 🧾 **Vouchers**: Create vouchers from receipt files (PDF, image, XML), list, book, reset and enshrine them, and download their attached documents.
- 💳 **Transactions**: List and filter bank transactions, for example the ones that are not booked yet.
- 🏦 **Check accounts**: List accounts, query balances, and create clearing or file import accounts.
- 🧭 **Receipt guidance**: Find bookable accounts and their allowed tax rules.
- 📄 **Documents**: List invoices, credit notes and orders, and download them as PDF.
- 🗄️ **Local database**: Copy the whole account into a local SQLite database with `db:sync`, incrementally where the API allows it, and keep records even after they are deleted in sevdesk.
- 📤 **Exports**: Export accounting data in the DATEV format, or contacts, invoices, transactions and vouchers as CSV.
- 🧩 **MCP server**: `sevdesk mcp` offers the read commands as tools to Claude Code and other MCP clients, optionally with draft-only writes.
- 🤖 **Automation-friendly**: `--json` output on every command, non-interactive mode, and stable exit codes.

## Requirements

- Node.js 22.13 or later.
- A sevdesk account on bookkeeping system version 2.0 (sevdesk-Update 2.0).

## Installation

Install the CLI globally:

Download `sevdesk-cli-X.Y.Z.tgz` from the [latest GitHub release](https://github.com/mi-skam/sevdesk/releases/latest) and install it globally:

```bash
npm install -g ./sevdesk-cli-X.Y.Z.tgz
```

The tarball bundles the matching SDK. The package is not published to npm; the
`@genz-its/sevdesk-cli` package on npm is the upstream distribution.

## Quickstart

```bash
# Log in with your sevdesk API token
sevdesk login

# Verify your setup
sevdesk doctor

# Find a booking account and its allowed tax rules
sevdesk guidance:accounts --expense

# Create an open voucher from a receipt file
sevdesk vouchers:create receipt.pdf --supplier-name "ACME GmbH" --amount 119 --tax-rule 9 --account-datev 26

# List unbooked bank transactions
sevdesk transactions:list --unbooked

# Book the voucher against a bank transaction
sevdesk vouchers:book 123 --amount 119 --check-account 1 --transaction 456
```

## Authentication

Run [`sevdesk login`](#login) to validate and store your API token. You can find the token in your sevdesk account under **Settings > User > API token**.

The token is resolved in the following order:

1. The `SEVDESK_TOKEN` environment variable.
2. The config file written by `sevdesk login` (`~/.config/sevdesk/config.json`, respecting `XDG_CONFIG_HOME`).

In CI or other automated environments, prefer the `SEVDESK_TOKEN` environment variable over storing the token on disk.

## Argument conventions

Primary inputs and target IDs are positional. Place them before options:

```bash
sevdesk invoices:get 42 --json
sevdesk contacts:add-email 42 --email billing@example.com --json
sevdesk vouchers:create receipt.pdf --supplier-name "ACME GmbH" --amount 119 --tax-rule 9 --account-datev 26
```

IDs must be positive safe integers. Commands with an existing interactive prompt still allow the target or receipt path to be omitted in a terminal; non-interactive calls must supply it. Filters (such as `invoices:list --contact 42`), relationship settings, output destinations (`--output`), and confirmations stay named options.

**Breaking syntax change:** Target `--id` flags, `contacts:add-* --contact`, and `vouchers:create --file` have been removed, without compatibility aliases. Update scripts to pass these values positionally. JSON output and confirmation requirements are unchanged.

## Local database

`sevdesk db:sync` copies every record of the account into a local SQLite database: contacts with their addresses, communication ways, accounting contacts (debitor/creditor numbers) and custom fields, invoices, credit notes, orders and quotes, vouchers, all of their positions, check accounts, transactions, private transaction rules, booking accounts, tags and parts. It only reads from sevdesk.

- **Location**: `SEVDESK_DB`, otherwise `$XDG_DATA_HOME/sevdesk/sevdesk.db`, otherwise `~/.local/share/sevdesk/sevdesk.db`. The file is created with mode `0600` and contains your accounting data, so keep it out of repositories and backups you share.
- **Incremental**: contacts, invoices, orders and vouchers are the only entities the API can filter by change time. After the first run they are fetched from one hour before the newest change already stored; everything else is fetched in full on every run.
- **Deletions**: a full fetch marks records it no longer sees as deleted instead of removing them. Incremental fetches cannot see deletions, so those four entities are fetched in full again once a week, or whenever you pass `--full`.
- **Atomic**: everything is fetched first and written in one transaction. A failed request leaves the database unchanged.
- **Change log**: from the second sync of an entity on, every record a sync finds new, changed, deleted or restored is logged with its data before and after. `db:history` shows the log. A record that changes twice between two syncs is logged once, with its latest state.
- Requires Node.js 22.13 or later (built-in `node:sqlite`).

Every `list` and `get` command for synced data accepts `--local` to answer from the database instead of the API: no requests, no token needed, and the same `--json` output as the live command. Filters, sort order, `--offset` and `--limit` reproduce the API's behavior, including its quirks. Commands the server computes (`accounts:balance`, `guidance:accounts`, `numbering:get`, `export:*`, `*:pdf`) stay live-only. Local results are only as fresh as the last `db:sync`.

Known differences from live output:

- Records with the same sort date (`voucherDate`, `valueDate`) or DATEV account number come back in an arbitrary order from the API; locally they are ordered by ID, newest first. A `--limit` cutting through such a group can therefore pick different records.
- `accounts-datev:get --local` returns the list representation, in which `create` and `update` are `null` for standard accounts. Hidden accounts are not synced and are only available live.
- `get --local` still shows a record that was deleted in sevdesk, with a warning naming when the sync stopped seeing it.

```bash
sevdesk db:sync          # first run: everything; later runs: only what changed
sevdesk db:sync --full   # fetch everything and detect deletions
sevdesk db:info          # path, size and record counts per entity
sevdesk db:history       # what the last syncs found new, changed or deleted
sevdesk db:history invoices 1234   # every logged change of one invoice
sevdesk vouchers:list --local --status 100   # answered from the database
```

## MCP server

`sevdesk mcp` runs a [Model Context Protocol](https://modelcontextprotocol.io) server on stdin/stdout, so Claude Code or another MCP client can query the account. Each tool is a CLI command (`vouchers_list` = `vouchers:list`) with the same options and the same JSON output, including `local` to answer from the [local database](#local-database). It uses the token and database of the CLI.

```bash
claude mcp add sevdesk -- sevdesk mcp                  # read-only
claude mcp add sevdesk -- sevdesk mcp --allow-writes   # plus writes
```

- **Read-only by default**: every `list` and `get` command, `accounts:balance`, `guidance:accounts`, `invoices:overdue`, `numbering:get`, `doctor`, the layout and placeholder lists, and `db:info`, `db:history` and `db:sync` (which writes only the local database).
- **`--allow-writes`** adds tools that create without changing anything booked: `vouchers:create` (always as a draft, status 50), `invoices:create` (a draft, never sent), `contacts:create` and `contacts:add-address`/`add-email`/`add-phone`, and `tags:create`. Your MCP client asks before each call.
- **`--allow-writes`** also adds `invoices:cancel` and `invoices:send`, which cannot be undone: cancelling creates a cancellation invoice, sending emails the customer. They are marked destructive, and `invoices:send` takes the delivery JSON as a file path and always writes its receipt to the default location.
- **Never offered**: booking, enshrining, resetting, deleting, updating existing records, sending quotes, layouts, PDFs, exports and anything else that writes files, `login`/`logout`.
- Results are compact JSON without the Base64 thumbnails and PDFs of templates and letterpapers, HTML fields (such as the head and foot texts of invoices) come back as plain text, `null` fields and `sevClient` are left out, and a contact embedded in another record keeps only its id, name and customer number. A list longer than about 20,000 tokens is cut to the records that fit, with a note on how to page or filter for the rest.
- Confirmation prompts of the CLI are answered by the client's tool approval, so writes run with `--yes`. A missing argument is an error, never a prompt.

## Scripting

The CLI is designed to be scriptable:

- **`--json`**: Every command supports the `--json` flag to output machine-readable JSON.
- **Non-interactive mode**: When the CLI runs without a TTY or with the `CI` environment variable set, it never prompts. Missing required values cause an error and exit code `1` instead.
- **`--yes`**: Commands that ask for confirmation accept `--yes` to skip the prompt.
- **Exit codes**: `0` on success, `1` on any failure.

```bash
# Example: print the IDs of all unbooked transactions
sevdesk transactions:list --unbooked --json | jq -r '.[].id'
```

## Tax rules

Bookkeeping system 2.0 identifies VAT treatment by a tax rule ID (`taxRuleId` in `invoices:create` and quotes, `--tax-rule` in `vouchers:create`). The IDs are fixed across accounts; the allowed tax rates per position are enforced by the API (`422` otherwise). Use [`guidance:accounts`](#guidanceaccounts) to see which tax rules a booking account allows.

| ID  | Tax rule                                                            | Use     | Tax rates  | Not supported for                                                            |
| --- | ------------------------------------------------------------------- | ------- | ---------- | ---------------------------------------------------------------------------- |
| 1   | Umsatzsteuerpflichtige Umsätze                                      | Revenue | 0, 7, 19   |                                                                              |
| 2   | Ausfuhren                                                           | Revenue | 0          |                                                                              |
| 3   | Innergemeinschaftliche Lieferungen                                  | Revenue | 0, 7, 19   |                                                                              |
| 4   | Steuerfreie Umsätze §4 UStG                                         | Revenue | 0          |                                                                              |
| 5   | Reverse Charge gem. §13b UStG                                       | Revenue | 0          |                                                                              |
| 17  | Nicht im Inland steuerbare Leistung (e.g. customers outside the EU) | Revenue | 0          | Advance, partial and final invoices                                          |
| 18  | One Stop Shop (goods)                                               | Revenue | By country | Vouchers, e-invoices, custom revenue account, advance/partial/final invoices |
| 19  | One Stop Shop (electronic service)                                  | Revenue | By country | Same as 18                                                                   |
| 20  | One Stop Shop (other service)                                       | Revenue | By country | Same as 18                                                                   |
| 21  | Reverse Charge gem. §18b UStG                                       | Revenue | 0          | Vouchers, advance/partial/final invoices                                     |
| 8   | Innergemeinschaftliche Erwerbe                                      | Expense | 0, 7, 19   |                                                                              |
| 9   | Vorsteuerabziehbare Aufwendungen                                    | Expense | 0, 7, 19   |                                                                              |
| 10  | Nicht vorsteuerabziehbare Aufwendungen                              | Expense | 0          |                                                                              |
| 12  | Reverse Charge gem. §13b Abs. 2 UStG mit Vorsteuerabzug 0% (19%)    | Expense | 0          |                                                                              |
| 13  | Reverse Charge gem. §13b UStG ohne Vorsteuerabzug 0% (19%)          | Expense | 0          |                                                                              |
| 14  | Reverse Charge gem. §13b Abs. 1 EU Umsätze 0% (19%)                 | Expense | 0          |                                                                              |
| 11  | Steuer nicht erhoben nach §19 UStG (Kleinunternehmer)               | Revenue | 0          |                                                                              |

Small businesses (Kleinunternehmer) use 11 for revenue and 10 or 13 for expenses. Source: the sevdesk API specification and [API news](https://tech.sevdesk.com/api_news/), as of November 2026.

## Commands

- [`login`](#login)
- [`logout`](#logout)
- [`doctor`](#doctor)
- [`mcp`](#mcp)
- [`credit-notes:print`](#credit-notesprint)
- [`db:history`](#dbhistory)
- [`db:info`](#dbinfo)
- [`db:sync`](#dbsync)
- [`accounting-contacts:create`](#accounting-contactscreate)
- [`accounting-contacts:delete`](#accounting-contactsdelete)
- [`accounting-contacts:get`](#accounting-contactsget)
- [`accounting-contacts:list`](#accounting-contactslist)
- [`accounting-contacts:update`](#accounting-contactsupdate)
- [`accounts-datev:get`](#accounts-datevget)
- [`accounts-datev:list`](#accounts-datevlist)
- [`accounts:balance`](#accountsbalance)
- [`accounts:create-clearing`](#accountscreate-clearing)
- [`accounts:create-file-import`](#accountscreate-file-import)
- [`accounts:get`](#accountsget)
- [`accounts:list`](#accountslist)
- [`contact-field-settings:create`](#contact-field-settingscreate)
- [`contact-field-settings:delete`](#contact-field-settingsdelete)
- [`contact-field-settings:get`](#contact-field-settingsget)
- [`contact-field-settings:list`](#contact-field-settingslist)
- [`contact-field-settings:update`](#contact-field-settingsupdate)
- [`contact-field-settings:usage`](#contact-field-settingsusage)
- [`contact-fields:create`](#contact-fieldscreate)
- [`contact-fields:delete`](#contact-fieldsdelete)
- [`contact-fields:get`](#contact-fieldsget)
- [`contact-fields:list`](#contact-fieldslist)
- [`contact-fields:update`](#contact-fieldsupdate)
- [`contacts:add-address`](#contactsadd-address)
- [`contacts:add-email`](#contactsadd-email)
- [`contacts:add-phone`](#contactsadd-phone)
- [`contacts:create`](#contactscreate)
- [`contacts:delete`](#contactsdelete)
- [`contacts:delete-address`](#contactsdelete-address)
- [`contacts:get`](#contactsget)
- [`contacts:list`](#contactslist)
- [`contacts:update`](#contactsupdate)
- [`contacts:update-address`](#contactsupdate-address)
- [`credit-notes:get`](#credit-notesget)
- [`credit-notes:layout`](#credit-noteslayout)
- [`credit-notes:list`](#credit-noteslist)
- [`credit-notes:pdf`](#credit-notespdf)
- [`export:contacts`](#exportcontacts)
- [`export:datev`](#exportdatev)
- [`export:invoices`](#exportinvoices)
- [`export:transactions`](#exporttransactions)
- [`export:vouchers`](#exportvouchers)
- [`guidance:accounts`](#guidanceaccounts)
- [`invoices:cancel`](#invoicescancel)
- [`invoices:create`](#invoicescreate)
- [`invoices:delete`](#invoicesdelete)
- [`invoices:send`](#invoicessend)
- [`invoices:update`](#invoicesupdate)
- [`invoices:get`](#invoicesget)
- [`invoices:layout`](#invoiceslayout)
- [`invoices:list`](#invoiceslist)
- [`invoices:overdue`](#invoicesoverdue)
- [`invoices:pdf`](#invoicespdf)
- [`layouts:letterpapers`](#layoutsletterpapers)
- [`layouts:templates`](#layoutstemplates)
- [`numbering:get`](#numberingget)
- [`orders:get`](#ordersget)
- [`orders:layout`](#orderslayout)
- [`orders:list`](#orderslist)
- [`orders:pdf`](#orderspdf)
- [`parts:get`](#partsget)
- [`parts:list`](#partslist)
- [`placeholders:list`](#placeholderslist)
- [`private-transaction-rules:create`](#private-transaction-rulescreate)
- [`private-transaction-rules:delete`](#private-transaction-rulesdelete)
- [`private-transaction-rules:list`](#private-transaction-ruleslist)
- [`quotes:create`](#quotescreate)
- [`quotes:get`](#quotesget)
- [`quotes:list`](#quoteslist)
- [`quotes:pdf`](#quotespdf)
- [`quotes:send`](#quotessend)
- [`tags:create`](#tagscreate)
- [`tags:delete`](#tagsdelete)
- [`tags:list`](#tagslist)
- [`transactions:create`](#transactionscreate)
- [`transactions:get`](#transactionsget)
- [`transactions:list`](#transactionslist)
- [`vouchers:book`](#vouchersbook)
- [`vouchers:create`](#voucherscreate)
- [`vouchers:document`](#vouchersdocument)
- [`vouchers:enshrine`](#vouchersenshrine)
- [`vouchers:get`](#vouchersget)
- [`vouchers:list`](#voucherslist)
- [`vouchers:open`](#vouchersopen)
- [`vouchers:positions`](#voucherspositions)
- [`vouchers:reset-to-draft`](#vouchersreset-to-draft)
- [`vouchers:reset-to-open`](#vouchersreset-to-open)
- [`vouchers:update`](#vouchersupdate)

### `login`

Log in with your sevdesk API token. The token is validated against the sevdesk API and stored in the config file. Accounts on bookkeeping system version 1.0 are rejected.

```bash
sevdesk login [options]
```

**Options:**

- `--token`: The sevdesk API token. If omitted, you will be prompted.

### `mcp`

Run a Model Context Protocol server on stdin/stdout that offers the read commands as tools. See [MCP server](#mcp-server).

```bash
sevdesk mcp [options]
```

**Options:**

- `--allow-writes`: Also offer write tools: draft vouchers and invoices, contacts with their addresses, e-mails and phone numbers, and tags, plus `invoices_cancel` and `invoices_send`, which cancel an invoice and email invoices to customers and cannot be undone. Never booking or deleting. Defaults to `false`.

### `logout`

Log out by removing the stored API token.

```bash
sevdesk logout
```

### `doctor`

Check the CLI setup and the connection to the sevdesk API.

```bash
sevdesk doctor [options]
```

**Options:**

- `--json`: Output in JSON format.

### `credit-notes:print`

Render a credit note to a PDF file and **mark it as sent**, by default as printed (`VPR`). Use `credit-notes:pdf` to download it without marking it.

```bash
sevdesk credit-notes:print [id] [options]
```

**Argument:** `id` — ID of the credit note. If omitted, you will be prompted.

**Options:**

- `--send-type`: How it was sent: `VPR` printed, `VP` postal, `VM` mailed, `VPDF` downloaded. Defaults to `VPR`.
- `--output`: Path to write the PDF to. Defaults to `credit-note-<id>.pdf`.
- `--yes`: Skip the confirmation prompt. Defaults to `false`.
- `--json`: Output in JSON format.

### `db:history`

Show the change log of the local database, newest first, with a short label per record (number or name, amount, other party): what each `db:sync` found new, changed (with the fields that changed, e.g. `status: 200 → 1000`), deleted or restored. The first sync of an entity logs nothing, since it has nothing to compare against. Makes no request.

```bash
sevdesk db:history [entity] [id] [options]
```

**Arguments:**

- `entity` — Only changes of this entity, as `db:sync` names it (e.g. `vouchers`, `invoices`, `transactions`).
- `id` — Only changes of this record; needs the entity.

**Options:**

- `--since`: Only changes recorded at or after this moment. Unix seconds, a date (`YYYY-MM-DD`, midnight UTC) or an ISO 8601 timestamp.
- `--limit`: Maximum number of changes to show. Defaults to 20, or all of them for one record.
- `--json`: Output in JSON format, including each record before and after the change.

### `db:info`

Show where the local database is, how many records it holds per entity, when each was last synced and how many entries the change log has. Fails with a hint to run `db:sync` when there is no database yet.

```bash
sevdesk db:info [options]
```

**Options:**

- `--json`: Output in JSON format.

### `db:sync`

Copy every record of the account into the [local database](#local-database). Contacts, invoices, orders and vouchers are fetched incrementally after the first run; everything else, and those four once a week, is fetched in full. Records deleted in sevdesk are kept and marked deleted. Entities the API token may not read (`403`) are skipped.

```bash
sevdesk db:sync [options]
```

**Options:**

- `--full`: Fetch every entity in full, which also detects deletions of incrementally synced ones. Defaults to `false`.
- `--json`: Output in JSON format: the database path, per entity the mode and the number of fetched, inserted, updated, unchanged and deleted records, the skipped entities and the number of requests.

### `accounting-contacts:create`

Give a contact a debitor and/or creditor number.

```bash
sevdesk accounting-contacts:create [options]
```

**Options:**

- `--contact`: ID of the contact. If omitted, you will be prompted.
- `--debitor-number`: Debitor number for the contact.
- `--creditor-number`: Creditor number for the contact.
- `--json`: Output in JSON format.

### `accounting-contacts:delete`

Delete an accounting contact. sevdesk warns this can cause booking errors, especially in the DATEV export.

```bash
sevdesk accounting-contacts:delete [id] [options]
```

**Argument:** `id` — The accounting contact ID. If omitted, you will be prompted.

**Options:**

- `--yes`: Skip the confirmation prompt. Defaults to `false`.
- `--json`: Output in JSON format.

### `accounting-contacts:get`

Show a single accounting contact.

```bash
sevdesk accounting-contacts:get [id] [options]
```

**Argument:** `id` — The accounting contact ID. If omitted, you will be prompted.

**Options:**

- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `accounting-contacts:list`

List accounting contacts: the debitor and creditor numbers of contacts. Accounting contacts that belong to a bare name rather than a contact (for example a voucher supplier entered without one) have no `contact` but a `contactName`; they come first, then the rest by contact ID. The table shows the contact's name, or the bare name.

```bash
sevdesk accounting-contacts:list [options]
```

**Options:**

- `--contact`: Only the accounting contact of this contact ID.
- `--limit`: Maximum number of accounting contacts to return. Defaults to all of them.
- `--offset`: Number of accounting contacts to skip.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `accounting-contacts:update`

Change the debitor or creditor number of an accounting contact. sevdesk warns this can cause booking errors, especially in the DATEV export.

```bash
sevdesk accounting-contacts:update [id] [options]
```

**Argument:** `id` — The accounting contact ID. If omitted, you will be prompted.

**Options:**

- `--debitor-number`: New debitor number.
- `--creditor-number`: New creditor number.
- `--yes`: Skip the confirmation prompt. Defaults to `false`.
- `--json`: Output in JSON format.

### `accounts-datev:get`

Show a single booking account (AccountDatev), including hidden accounts that [`accounts-datev:list`](#accounts-datevlist) does not return. Backed by an undocumented sevdesk endpoint that may change without notice.

```bash
sevdesk accounts-datev:get [id] [options]
```

**Argument:** `id` — The booking account ID. If omitted, you will be prompted.

**Options:**

- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `accounts-datev:list`

List booking accounts (AccountDatev). Covers only accounts visible in the sevdesk account picker; hidden accounts (for example some tax accounts) are reachable via [`accounts-datev:get`](#accounts-datevget). Backed by an undocumented sevdesk endpoint that may change without notice.

```bash
sevdesk accounts-datev:list [options]
```

**Options:**

- `--number`: Only show accounts with this account number. Filtered client-side across all visible accounts.
- `--name-like`: Only show accounts whose name contains this text. Filtered client-side across all visible accounts.
- `--limit`: Maximum number of accounts to return. Defaults to all of them.
- `--offset`: Number of accounts to skip before filtering.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `accounts:balance`

Show the balance of a check account at a given date. The balance is the sum of all transactions known to sevdesk, which is not necessarily the real bank balance.

```bash
sevdesk accounts:balance [id] [options]
```

**Argument:** `id` — The check account ID. If omitted, you will be prompted.

**Options:**

- `--date`: The date to calculate the balance for (`YYYY-MM-DD`). Defaults to today.
- `--json`: Output in JSON format.

### `accounts:create-clearing`

Create a clearing check account.

```bash
sevdesk accounts:create-clearing [options]
```

**Options:**

- `--name`: The name of the check account. If omitted, you will be prompted.
- `--accounting-number`: The booking account number of the check account.
- `--json`: Output in JSON format.

### `accounts:create-file-import`

Create a check account that imports its transactions from files.

```bash
sevdesk accounts:create-file-import [options]
```

**Options:**

- `--name`: The name of the check account. If omitted, you will be prompted.
- `--import-type`: The file format used to import transactions. Supported values are `CSV` and `MT940`. Defaults to `CSV`.
- `--accounting-number`: The booking account number of the check account.
- `--iban`: The IBAN of the check account.
- `--json`: Output in JSON format.

### `accounts:get`

Show a single check account.

```bash
sevdesk accounts:get [id] [options]
```

**Argument:** `id` — The check account ID. If omitted, you will be prompted.

**Options:**

- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `accounts:list`

List your check accounts.

```bash
sevdesk accounts:list [options]
```

**Options:**

- `--limit`: The maximum number of check accounts to return. Defaults to all of them.
- `--offset`: The number of check accounts to skip.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `contact-field-settings:create`

Create a custom field definition for contacts.

```bash
sevdesk contact-field-settings:create [options]
```

**Options:**

- `--name`: Name of the field. If omitted, you will be prompted.
- `--description`: Description of the field.
- `--json`: Output in JSON format.

### `contact-field-settings:delete`

Delete a custom field definition. The confirmation names how many field values use it.

```bash
sevdesk contact-field-settings:delete [id] [options]
```

**Argument:** `id` — The definition ID. If omitted, you will be prompted.

**Options:**

- `--yes`: Skip the confirmation prompt. Defaults to `false`.
- `--json`: Output in JSON format.

### `contact-field-settings:get`

Show a single custom field definition.

```bash
sevdesk contact-field-settings:get [id] [options]
```

**Argument:** `id` — The definition ID. If omitted, you will be prompted.

**Options:**

- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `contact-field-settings:list`

List the custom field definitions for contacts.

```bash
sevdesk contact-field-settings:list [options]
```

**Options:**

- `--limit`: Maximum number of definitions to return. Defaults to all of them.
- `--offset`: Number of definitions to skip.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `contact-field-settings:update`

Rename or describe a custom field definition.

```bash
sevdesk contact-field-settings:update [id] [options]
```

**Argument:** `id` — The definition ID. If omitted, you will be prompted.

**Options:**

- `--name`: New name.
- `--description`: New description.
- `--json`: Output in JSON format.

### `contact-field-settings:usage`

Count the contacts that have a value for a custom field definition.

```bash
sevdesk contact-field-settings:usage [id] [options]
```

**Argument:** `id` — The definition ID. If omitted, you will be prompted.

**Options:**

- `--json`: Output in JSON format.

### `contact-fields:create`

Set a custom field of a contact.

```bash
sevdesk contact-fields:create [options]
```

**Options:**

- `--contact`: ID of the contact. If omitted, you will be prompted.
- `--setting`: ID of the field definition, see `contact-field-settings:list`. If omitted, you will be prompted.
- `--value`: Value of the field. If omitted, you will be prompted.
- `--json`: Output in JSON format.

### `contact-fields:delete`

Delete the value of a custom field.

```bash
sevdesk contact-fields:delete [id] [options]
```

**Argument:** `id` — The contact field ID. If omitted, you will be prompted.

**Options:**

- `--yes`: Skip the confirmation prompt. Defaults to `false`.
- `--json`: Output in JSON format.

### `contact-fields:get`

Show a single custom field value.

```bash
sevdesk contact-fields:get [id] [options]
```

**Argument:** `id` — The contact field ID. If omitted, you will be prompted.

**Options:**

- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `contact-fields:list`

List the custom field values of contacts.

```bash
sevdesk contact-fields:list [options]
```

**Options:**

- `--contact`: Only the fields of this contact ID. The API rejects an ID that is not a contact; `--local` returns an empty list instead.
- `--limit`: Maximum number of field values to return. Defaults to all of them.
- `--offset`: Number of field values to skip.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `contact-fields:update`

Change the value of a custom field.

```bash
sevdesk contact-fields:update [id] [options]
```

**Argument:** `id` — The contact field ID. If omitted, you will be prompted.

**Options:**

- `--value`: New value. If omitted, you will be prompted.
- `--json`: Output in JSON format.

### `contacts:add-address`

Add an address to a contact.

```bash
sevdesk contacts:add-address [contact-id] [options]
```

**Argument:** `contact-id` — The contact ID. If omitted, you will be prompted.

**Options:**

- `--street`: Street and house number.
- `--zip`: Zip code.
- `--city`: City name.
- `--country`: ID of the country as a StaticCountry ID, for example `1` for Germany. There is no lookup endpoint in this CLI, but an existing address of a contact reveals the IDs of other countries. If omitted, you will be prompted.
- `--category`: ID of the address category. The sevdesk API does not document the IDs, they are listed by a `GET` to `/Category?objectType=ContactAddress` and an existing address of a contact reveals the ones in use. If omitted, you will be prompted.
- `--json`: Output in JSON format.

### `contacts:add-email`

Add an e-mail address to a contact.

```bash
sevdesk contacts:add-email [contact-id] [options]
```

**Argument:** `contact-id` — The contact ID. If omitted, you will be prompted.

**Options:**

- `--email`: The e-mail address. If omitted, you will be prompted.
- `--key`: ID of the communication way key: `1` private, `2` work, `7` newsletter, `8` invoicing. Defaults to `2`.
- `--main`: Mark the e-mail address as the main one of the contact. Defaults to `false`.
- `--json`: Output in JSON format.

### `contacts:add-phone`

Add a phone number to a contact.

```bash
sevdesk contacts:add-phone [contact-id] [options]
```

**Argument:** `contact-id` — The contact ID. If omitted, you will be prompted.

**Options:**

- `--phone`: The phone number. If omitted, you will be prompted.
- `--key`: ID of the communication way key: `1` private, `2` work, `3` fax, `4` mobile. Defaults to `2`.
- `--main`: Mark the phone number as the main one of the contact. Defaults to `false`.
- `--json`: Output in JSON format.

### `contacts:create`

Create a contact. Use `--name` for organizations and `--surename` together with `--familyname` for persons.

```bash
sevdesk contacts:create [options]
```

**Options:**

- `--name`: Name of the organization. Not to be used for persons. If both `--name` and `--familyname` are omitted, you will be prompted for the organization name.
- `--surename`: First name of the person. Not to be used for organizations.
- `--familyname`: Last name of the person. Not to be used for organizations.
- `--category`: ID of the contact category: `2` supplier, `3` customer, `4` partner. Defaults to `3`.
- `--customer-number`: Customer number of the contact.
- `--description`: Description of the contact.
- `--vat-number`: VAT number of the contact.
- `--tax-number`: Tax number of the contact.
- `--json`: Output in JSON format.

### `contacts:delete`

Delete a contact.

```bash
sevdesk contacts:delete [id] [options]
```

**Argument:** `id` — The contact ID. If omitted, you will be prompted.

**Options:**

- `--yes`: Skip the confirmation prompt. Defaults to `false`.
- `--json`: Output in JSON format.

### `contacts:delete-address`

Delete an address of a contact.

```bash
sevdesk contacts:delete-address [address-id] [options]
```

**Argument:** `address-id` — The contact address ID, as shown by [`contacts:get`](#contactsget). If omitted, you will be prompted.

**Options:**

- `--yes`: Skip the confirmation prompt. Defaults to `false`.
- `--json`: Output in JSON format.

### `contacts:get`

Show a single contact with its addresses and communication ways.

```bash
sevdesk contacts:get [id] [options]
```

**Argument:** `id` — The contact ID. If omitted, you will be prompted.

**Options:**

- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format. Prints an object with the keys `contact`, `addresses` and `communicationWays`.

### `contacts:list`

List contacts.

```bash
sevdesk contacts:list [options]
```

**Options:**

- `--name`: Filter by organization, first or last name.
- `--customer-number`: Filter by customer number.
- `--depth`: Contact depth: `0` returns only organizations, `1` organizations and persons. Defaults to `0`.
- `--category`: ID of the contact category to filter by: `2` supplier, `3` customer, `4` partner.
- `--created-after`: Only contacts created at or after this moment: Unix seconds, a date (`YYYY-MM-DD`, midnight UTC) or an ISO 8601 timestamp.
- `--created-before`: Only contacts created at or before this moment. Same formats.
- `--updated-after`: Only contacts last changed at or after this moment. Same formats.
- `--updated-before`: Only contacts last changed at or before this moment. Same formats.
- `--limit`: Maximum number of contacts to return. Defaults to all of them.
- `--offset`: Number of contacts to skip.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `contacts:update`

Update a contact. Only the given fields are changed.

```bash
sevdesk contacts:update [id] [options]
```

**Argument:** `id` — The contact ID. If omitted, you will be prompted.

**Options:**

- `--name`: Name of the organization. Not to be used for persons.
- `--surename`: First name of the person. Not to be used for organizations.
- `--familyname`: Last name of the person. Not to be used for organizations.
- `--category`: ID of the contact category: `2` supplier, `3` customer, `4` partner.
- `--customer-number`: Customer number of the contact.
- `--description`: Description of the contact.
- `--vat-number`: VAT number of the contact.
- `--tax-number`: Tax number of the contact.
- `--json`: Output in JSON format.

### `contacts:update-address`

Update an address of a contact. Only the given fields are changed.

```bash
sevdesk contacts:update-address [address-id] [options]
```

**Argument:** `address-id` — The contact address ID, as shown by [`contacts:get`](#contactsget). If omitted, you will be prompted.

**Options:**

- `--street`: Street and house number.
- `--zip`: Zip code.
- `--city`: City name.
- `--country`: ID of the country as a StaticCountry ID, for example `1` for Germany.
- `--category`: ID of the address category.
- `--json`: Output in JSON format.

### `credit-notes:get`

Show a single credit note.

```bash
sevdesk credit-notes:get [id] [options]
```

**Argument:** `id` — ID of the credit note. If omitted, you will be prompted.

**Options:**

- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `credit-notes:layout`

Change the template, letterpaper, language or PayPal setting of a credit note. Each given option is one `changeParameter` request; find IDs with `layouts:templates` and `layouts:letterpapers`. The re-rendered PDF is not printed; download it with the pdf command.

```bash
sevdesk credit-notes:layout [id] [options]
```

**Argument:** `id` — The credit note ID. If omitted, you will be prompted.

**Options:**

- `--template`: Template ID.
- `--letterpaper`: Letterpaper ID.
- `--language`: Document language, for example `de_DE` or `en_US`.
- `--paypal`: PayPal setting value.
- `--json`: Output in JSON format.

### `credit-notes:list`

List credit notes.

```bash
sevdesk credit-notes:list [options]
```

**Options:**

- `--status`: Filter by status: `100` draft, `200` open, `750` partially paid, `1000` paid.
- `--credit-note-number`: Filter by credit note number.
- `--start-date`: Only credit notes on or after this date: `dd.mm.yyyy` or `YYYY-MM-DD` (German time), Unix seconds or an ISO 8601 timestamp.
- `--end-date`: Only credit notes on or before this date, same formats. A date includes the whole day.
- `--contact`: ID of the contact whose credit notes to list.
- `--limit`: Maximum number of credit notes to return. Defaults to all of them.
- `--offset`: Number of credit notes to skip.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `credit-notes:pdf`

Download the PDF of a credit note.

```bash
sevdesk credit-notes:pdf [id] [options]
```

**Argument:** `id` — ID of the credit note. If omitted, you will be prompted.

**Options:**

- `--output`: Path to write the PDF to. Defaults to the file name reported by the API.
- `--prevent-send-by`: Do not mark the credit note as sent by download. Defaults to `false`.
- `--json`: Output in JSON format.

### `export:contacts`

Export contacts as a CSV file.

```bash
sevdesk export:contacts [options]
```

**Options:**

- `--output`: Path to write the CSV file to. Defaults to the filename of the export.
- `--limit`: The maximum number of contacts to export.
- `--json`: Output in JSON format.

### `export:datev`

Export accounting data in the DATEV format as a ZIP archive. The export runs as a background job that the CLI waits for.

```bash
sevdesk export:datev [options]
```

**Options:**

- `--start-date`: Start of the export period as `dd.mm.yyyy` or Unix timestamp. If omitted, you will be prompted.
- `--end-date`: End of the export period as `dd.mm.yyyy` or Unix timestamp. If omitted, you will be prompted.
- `--format`: The DATEV export format. Supported values are `csv` and `xml`. Defaults to `csv`.
- `--scope`: The models to include as a string of letters: `E` (earnings), `X` (expenditure), `T` (transactions), `C` (cash register) and `D` (assets). XML exports support only `E` and `X`. Defaults to `EXTCD`.
- `--output`: Path to write the ZIP archive to. Defaults to the filename of the export.
- `--timeout`: Maximum number of seconds to wait for the export job. Defaults to `300`.
- `--json`: Output in JSON format.

### `export:invoices`

Export invoices as a CSV file.

```bash
sevdesk export:invoices [options]
```

**Options:**

- `--output`: Path to write the CSV file to. Defaults to the filename of the export.
- `--limit`: The maximum number of invoices to export.
- `--start-date`: Only export invoices on or after this date (ISO 8601).
- `--end-date`: Only export invoices on or before this date (ISO 8601).
- `--json`: Output in JSON format.

### `export:transactions`

Export transactions as a CSV file.

```bash
sevdesk export:transactions [options]
```

**Options:**

- `--output`: Path to write the CSV file to. Defaults to the filename of the export.
- `--limit`: The maximum number of transactions to export.
- `--start-date`: Only export transactions on or after this date (ISO 8601).
- `--end-date`: Only export transactions on or before this date (ISO 8601).
- `--json`: Output in JSON format.

### `export:vouchers`

Export vouchers as a CSV file.

```bash
sevdesk export:vouchers [options]
```

**Options:**

- `--output`: Path to write the CSV file to. Defaults to the filename of the export.
- `--limit`: The maximum number of vouchers to export.
- `--start-date`: Only export vouchers on or after this date (ISO 8601).
- `--end-date`: Only export vouchers on or before this date (ISO 8601).
- `--json`: Output in JSON format.

### `guidance:accounts`

List bookable accounts and their allowed tax rules. Covers only the ReceiptGuidance subset of VAT-relevant accounts — use [`accounts-datev:list`](#accounts-datevlist) for all booking accounts. The first matching filter wins: `--account-number`, `--tax-rule`, `--revenue`, `--expense`. Without a filter, all accounts are listed.

```bash
sevdesk guidance:accounts [options]
```

**Options:**

- `--account-number`: Only show the account with this datev account number.
- `--tax-rule`: Tax rule name, for example `USTPFL_UMS_EINN`.
- `--revenue`: Only show accounts that can be used for revenue. Defaults to `false`.
- `--expense`: Only show accounts that can be used for expenses. Defaults to `false`.
- `--json`: Output in JSON format.

### `invoices:cancel`

Cancel an open, unpaid invoice (status `200`, type `RE`). sevdesk creates a
cancellation invoice (Stornorechnung, type `SR`) for the negative amount, finalised
and enshrined, and sets the original to status `1000`. Cannot be undone. The
cancellation invoice is **not** sent; email it with [`invoices:send`](#invoicessend).
Drafts are refused (delete them with `invoices:delete`), as are partially paid,
paid and already cancelled invoices (use the sevdesk web app).

sevdesk numbers the cancellation invoice from its own counter (Nummernkreis), even
when that number is already used, for example by a draft that `invoices:create`
numbered explicitly. The command therefore reads the counter first and refuses when
its number exists; renumber that draft or raise the counter in sevdesk, then cancel
again. After cancelling it warns if the number still turned out to be a duplicate.
If the numbering format cannot be read, it warns and cancels without the check.

```bash
sevdesk invoices:cancel 9002 --yes --json
```

**Argument:** required invoice ID.

**Options:**

- `--yes`: Confirm cancelling. Otherwise prompts with number, contact, gross amount and the expected cancellation number; non-interactive mode requires `--yes`.
- `--json`: Return `{ cancelled: { invoiceId, invoiceNumber }, cancellation }`, where `cancellation` is the created cancellation invoice.

### `invoices:create`

Create a regular **draft** invoice from a JSON file, including multiple positions.
Never sends, books, or finalizes the invoice. Calls the SDK's `invoices.save` method.

```bash
sevdesk invoices:create invoice.json --dry-run --json
sevdesk invoices:create invoice.json --yes --json
```

**Argument:** `invoice.json` (required JSON input path, containing the invoice and positions).

**Options:**

- `--dry-run`: Validate and print the normalized payload without authentication or API calls.
- `--yes`: Confirm draft creation; required in non-interactive mode unless using `--dry-run`.
- `--json`: Print the SDK result (`invoice` and `positions`) as JSON.

Example `invoice.json` (invented IDs; resolve real contact, SevUser and unit IDs first; tax rule IDs are listed under [Tax rules](#tax-rules)):

```json
{
  "invoice": {
    "contactId": 7,
    "contactPersonId": 8,
    "invoiceDate": "2024-02-29",
    "deliveryDate": "2024-02-01",
    "deliveryDateUntil": "2024-02-28",
    "currency": "EUR",
    "taxRuleId": 1,
    "taxText": "Umsatzsteuer 19%",
    "showNet": true,
    "timeToPay": 14
  },
  "positions": [
    {
      "name": "Example consulting",
      "quantity": 2,
      "price": 100,
      "taxRate": 19,
      "unityId": 1
    }
  ]
}
```

Dates must be valid `YYYY-MM-DD` calendar dates. The service date and optional
period end cannot exceed the invoice date. `showNet` explicitly selects net
(`true`) or gross (`false`) unit prices. VAT treatment is required, not inferred.
At least one position is required. Positions are numbered automatically from zero;
the recipient's default address is used. Validate the contact's address before creating.

`invoiceNumber` may be omitted or blank: the CLI reads the configured numbering
format (Nummernformat) and all existing invoice numbers, including drafts, then
uses the highest matching numeric value + 1, respecting a higher configured
starting counter. It supplies that number explicitly to sevdesk and defaults an
omitted subject (Betreff) to `Rechnung Nr. <number>`. Explicit numbers and subjects
are preserved. A final duplicate check fails without posting if the number became
occupied; it does not silently renumber. The check is not an atomic reservation.
Only literal formats containing exactly one `%NUMBER` are supported automatically;
other formats require an explicit number. Offline `--dry-run` reports pending
number resolution without making account requests.

The invoice optionally accepts `header`, `headText`, `footText`,
`customerInternalNote`, `smallSettlement`, and `paymentMethodId`. Positions optionally accept `text`
and percentage `discount`. Unknown fields are rejected, including existing invoice IDs.
Only status `100` and type `RE` are allowed (both defaulted); special invoice types
are not supported by creation. Use `invoices:update` to edit an existing regular draft.

Local validation does not establish tax correctness or validate IDs against the
account. After creating, inspect the returned ID with `invoices:get`. A timed-out
creation may have succeeded: check for duplicates before retrying.

### `invoices:delete`

Permanently delete an **unsent draft**. Fetches the invoice first; refuses finalised,
sent, or enshrined invoices. Use a credit note or cancellation for finalised invoices (GoBD).

```bash
sevdesk invoices:delete 9001 --yes --json
```

**Argument:** required invoice ID.

**Options:**

- `--yes`: Confirm deletion. Otherwise prompts with number, contact, and gross amount; non-interactive mode requires `--yes`.
- `--json`: Return `{ deleted, invoiceId, invoiceNumber }` after successful deletion.

### `invoices:send`

Email and finalise an existing draft, without creating another invoice. Requires
status `100`, an empty `sendDate`, and no enshrinement. Never automatically resends.

Also emails a cancellation invoice (type `SR`) from `invoices:cancel`, which is
already finalised. sevdesk marks a mailed cancellation invoice only by `sendType`
`VM` and leaves its `sendDate` empty, so one with `sendType` `VM` or a `sendDate`
is refused as already sent, and the send is acknowledged by `sendType` `VM` with
status `1000`.

```bash
sevdesk invoices:send 9001 delivery.json --dry-run --json
sevdesk invoices:send 9001 delivery.json --yes --json --receipt /new/path/send-receipt.json
```

**Arguments:** required invoice ID and delivery JSON path.

Example `delivery.json` (invented recipient):

```json
{
  "delivery": {
    "to": "billing@acme.example",
    "subject": "Rechnung Nr. {{number}}",
    "message": "Thank you for your order.\nYour invoice {{number}} is attached.",
    "copyToSelf": true
  }
}
```

The shared quote/invoice delivery model also accepts `cc` and `bcc` arrays of
email addresses. `{{number}}` is replaced in subject and message with the stored
invoice number. The message is plain text, escaped as HTML with preserved line breaks.

**Options:**

- `--dry-run`: Validate offline, without authentication, network calls, receipts, or finalisation. Number substitution and account/draft validation remain pending.
- `--yes`: Confirm finalisation and recipient. Otherwise prompts with number, contact, gross amount, and all recipients; required non-interactively.
- `--receipt`: New operation receipt path (Vorgangsprotokoll). Existing files are never overwritten. Defaults to `$XDG_STATE_HOME/sevdesk/invoices/<uuid>.json` (or `~/.local/state/sevdesk/invoices/`). Files are private (`0600`).
- `--json`: Return the operation result including `state`, `invoiceId`, `invoiceNumber`, `status`, `sendType`, `sendDate`, and receipt path.

A successful send means sevdesk accepted it, not that inbox delivery was verified.
Sending is issued once. Errors or missing acknowledgements return `state: "send-unknown"`
and exit 1, with a read-only state check saved in the receipt. Inspect sevdesk and
the receipt before retrying; a timeout may have finalised and sent the invoice.
Never use `invoices:create` to retry sending.

### `invoices:update`

Partially update a regular (`RE`), unsent draft. Finalised invoices are immutable
(GoBD): use a credit note or cancellation instead. Never sends or finalises.

```bash
sevdesk invoices:update 9001 update.json --dry-run --json
sevdesk invoices:update 9001 update.json --yes --json
```

**Arguments:** required invoice ID and update JSON path.

```json
{
  "invoice": {
    "contactId": 1001,
    "takeDefaultAddress": true,
    "headText": "<p>Dear ACME Testbau GmbH,</p>"
  },
  "positions": [
    {
      "name": "ACME test support",
      "quantity": 1,
      "price": 1000,
      "taxRate": 19,
      "unityId": 1
    }
  ]
}
```

All `invoice` fields from `invoices:create` are optional and have no defaults on
update. Omitted fields retain their stored values. `address` and `addressCountryId`
are also accepted. `takeDefaultAddress` may be inside `invoice` or at the top level;
conflicting values are rejected. It fills the address from the selected contact.
Dates use the same `YYYY-MM-DD` validation as creation. Supplied dates are checked
offline; omitted dates are merged with stored dates for validation before saving.

**Warning:** supplying `positions` replaces **all** existing positions (paginated
read of old IDs, then one save with new positions and deletion references). At least
one position is required. Omit `positions` to leave them untouched. Changed explicit
invoice numbers are checked for collisions; the check is not an atomic reservation.

**Options:**

- `--dry-run`: Validate and print a normalized preview offline. Stored fields, old position IDs, and draft status are not resolved.
- `--yes`: Confirm editing (and replacement of all positions if supplied). Required non-interactively.
- `--json`: Re-read after saving and print the stored invoice, not the request payload.

A failed/timed-out save may have succeeded. Inspect the invoice before retrying.

### `invoices:get`

Show a single invoice.

```bash
sevdesk invoices:get [id] [options]
```

**Argument:** `id` — ID of the invoice. If omitted, you will be prompted.

**Options:**

- `--positions`: Include all line items, paginated through `/InvoicePos` (the invoice convenience endpoint can ignore offsets). With `--json`, returns `{ invoice, positions }` instead of the invoice alone.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `invoices:layout`

Change the template, letterpaper, language or PayPal setting of an invoice. Each given option is one `changeParameter` request; find IDs with `layouts:templates` and `layouts:letterpapers`. The re-rendered PDF is not printed; download it with the pdf command.

```bash
sevdesk invoices:layout [id] [options]
```

**Argument:** `id` — The invoice ID. If omitted, you will be prompted.

**Options:**

- `--template`: Template ID.
- `--letterpaper`: Letterpaper ID.
- `--language`: Document language, for example `de_DE` or `en_US`.
- `--paypal`: PayPal setting value.
- `--json`: Output in JSON format.

### `invoices:list`

List invoices.

```bash
sevdesk invoices:list [options]
```

**Options:**

- `--status`: Filter by status: `50` deactivated recurring, `100` draft, `200` open, `750` partially paid, `1000` paid. Also enforced client-side before applying `--limit`.
- `--drafts`: Shortcut for `--status 100`; conflicts with any other status. With `--json`, always return `{ invoices, warnings }`.
- `--invoice-number`: Filter by invoice number.
- `--start-date`: Only invoices on or after this date: `dd.mm.yyyy` or `YYYY-MM-DD` (German time), Unix seconds or an ISO 8601 timestamp.
- `--end-date`: Only invoices on or before this date, same formats. A date includes the whole day.
- `--contact`: ID of the contact whose invoices to list.
- `--created-after`: Only invoices created at or after this moment: Unix seconds, a date (`YYYY-MM-DD`, midnight UTC) or an ISO 8601 timestamp.
- `--created-before`: Only invoices created at or before this moment. Same formats.
- `--updated-after`: Only invoices last changed at or after this moment. Same formats.
- `--updated-before`: Only invoices last changed at or before this moment. Same formats.
- `--limit`: Maximum number of invoices to return. Defaults to all of them.
- `--offset`: Number of invoices to skip.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

Duplicate draft numbers in the returned rows produce a warning on stderr naming
the number and all matching draft IDs. With `--json`, duplicates return
`{ invoices, warnings }`, even without `--drafts`. Otherwise the legacy JSON array
is preserved; use `--drafts --json` for a stable warnings envelope. Limits, offsets,
and other filters restrict duplicate detection; omit them for a complete check.

### `invoices:overdue`

List open and partially paid invoices (status 200 and 750) whose due date has passed, most overdue first, with the amount still open. The due date is the invoice date plus its payment term (`timeToPay`) in German time; an invoice is overdue from the day after. Reminders and recurring invoices are left out, as in `invoices:list`.

```bash
sevdesk invoices:overdue [options]
```

**Options:**

- `--date`: The day to check against, as `YYYY-MM-DD` or `dd.mm.yyyy`. Defaults to today in German time.
- `--contact`: ID of the contact whose invoices to check.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format: per invoice `dueDate`, `daysOverdue`, `paidAmount` and `openAmount`.

### `invoices:pdf`

Download the PDF of an invoice.

```bash
sevdesk invoices:pdf [id] [options]
```

**Argument:** `id` — ID of the invoice. If omitted, you will be prompted.

**Options:**

- `--output`: Path to write the PDF to. Defaults to the file name reported by the API.
- `--prevent-send-by`: Do not mark the invoice as sent by download. Defaults to `false`.
- `--json`: Output in JSON format.

### `layouts:letterpapers`

List the letterpapers.

```bash
sevdesk layouts:letterpapers [options]
```

**Options:**

- `--json`: Output in JSON format, including the Base64 PDF and thumbnail.

### `layouts:templates`

List the document templates. The type filter is case-sensitive.

```bash
sevdesk layouts:templates [options]
```

**Options:**

- `--type`: Only templates of this type: `Invoice`, `Invoicereminder`, `Order`, `Contractnote`, `Packinglist`, `Letter`, `Creditnote`.
- `--json`: Output in JSON format, including the template HTML and thumbnail.

### `numbering:get`

Read invoice or quote numbering configuration (Nummernkreis) without reserving
or consuming a number. Uses `GET /SevSequence/Factory/getByType`, described in
sevdesk's official API introduction under **The invoice number**.

```bash
sevdesk numbering:get --kind invoice
sevdesk numbering:get --kind quote --json
sevdesk numbering:get --kind quote --suggest --json
```

`--kind` defaults to `invoice` (Rechnung); `quote` means Angebot. Human output
shows the format (Nummernformat) and configured counter (Eingestellter Zähler).
JSON returns the sequence metadata. `--suggest` instead scans all existing numbers,
including drafts, and returns `nextNumber`, `highestExistingNumber`,
`configuredCounter`, `format`, `kind`, and `reserved: false`, using the same logic
as creation. **The configured counter is not necessarily
free:** existing drafts (Entwürfe) can already use it. For a simple `%NUMBER`
format, inspect existing numbers, including drafts, numerically rather than
lexicographically and choose at least the highest used number plus one while
respecting a higher configured starting number. Recheck for duplicates before
saving. This is not an atomic number reservation.

### `orders:get`

Show a single order.

```bash
sevdesk orders:get [id] [options]
```

**Argument:** `id` — ID of the order. If omitted, you will be prompted.

**Options:**

- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `orders:layout`

Change the template, letterpaper, language or PayPal setting of an order. Each given option is one `changeParameter` request; find IDs with `layouts:templates` and `layouts:letterpapers`. The re-rendered PDF is not printed; download it with the pdf command.

```bash
sevdesk orders:layout [id] [options]
```

**Argument:** `id` — The order ID. If omitted, you will be prompted.

**Options:**

- `--template`: Template ID.
- `--letterpaper`: Letterpaper ID.
- `--language`: Document language, for example `de_DE` or `en_US`.
- `--paypal`: PayPal setting value.
- `--json`: Output in JSON format.

### `orders:list`

List orders.

```bash
sevdesk orders:list [options]
```

**Options:**

- `--status`: Filter by status: `100` draft, `200` delivered, `300` rejected, `500` accepted, `750` partially calculated, `1000` calculated.
- `--order-number`: Filter by order number.
- `--start-date`: Only orders on or after this date: `dd.mm.yyyy` or `YYYY-MM-DD` (German time), Unix seconds or an ISO 8601 timestamp.
- `--end-date`: Only orders on or before this date, same formats. A date includes the whole day.
- `--contact`: ID of the contact whose orders to list.
- `--created-after`: Only orders created at or after this moment: Unix seconds, a date (`YYYY-MM-DD`, midnight UTC) or an ISO 8601 timestamp.
- `--created-before`: Only orders created at or before this moment. Same formats.
- `--updated-after`: Only orders last changed at or after this moment. Same formats.
- `--updated-before`: Only orders last changed at or before this moment. Same formats.
- `--limit`: Maximum number of orders to return. Defaults to all of them.
- `--offset`: Number of orders to skip.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `orders:pdf`

Download the PDF of an order.

```bash
sevdesk orders:pdf [id] [options]
```

**Argument:** `id` — ID of the order. If omitted, you will be prompted.

**Options:**

- `--output`: Path to write the PDF to. Defaults to the file name reported by the API.
- `--prevent-send-by`: Do not mark the order as sent by download. Defaults to `false`.
- `--json`: Output in JSON format.

### `parts:get`

Show a single part.

```bash
sevdesk parts:get [id] [options]
```

**Argument:** `id` — The part ID. If omitted, you will be prompted.

**Options:**

- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `parts:list`

List parts.

```bash
sevdesk parts:list [options]
```

**Options:**

- `--name`: Filter by part name.
- `--part-number`: Filter by part number.
- `--limit`: Maximum number of parts to return. Defaults to all of them.
- `--offset`: Number of parts to skip.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `placeholders:list`

List the placeholders (such as `[%KUNDENNUMMER%]`) usable in the texts of a document type, grouped by what they refer to.

```bash
sevdesk placeholders:list [options]
```

**Options:**

- `--object-type`: Document type: `Invoice`, `CreditNote`, `Order`, `Contact`, `Letter` or `Email`.
- `--sub-object-type`: For `Email`: the document type the e-mail is sent with.
- `--json`: Output in JSON format.

### `private-transaction-rules:create`

Create a rule that marks matching bank transactions as private automatically.

```bash
sevdesk private-transaction-rules:create [options]
```

**Options:**

- `--counterpart`: Counterpart name of the transactions to match.
- `--purpose`: Payment purpose of the transactions to match.
- `--json`: Output in JSON format.

### `private-transaction-rules:delete`

Delete a private transaction rule.

```bash
sevdesk private-transaction-rules:delete [id] [options]
```

**Argument:** `id` — The rule ID. If omitted, you will be prompted.

**Options:**

- `--yes`: Skip the confirmation prompt. Defaults to `false`.
- `--json`: Output in JSON format.

### `private-transaction-rules:list`

List the rules that mark bank transactions as private.

```bash
sevdesk private-transaction-rules:list [options]
```

**Options:**

- `--limit`: Maximum number of rules to return. Defaults to all of them.
- `--offset`: Number of rules to skip.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `quotes:create`

Create/edit quote drafts (Angebotsentwürfe) interactively or from `quote.json`,
with optional explicit sending (Versenden).

```bash
sevdesk quotes:create
sevdesk quotes:create quote.json --interactive
sevdesk quotes:create quote.json --dry-run --json
sevdesk quotes:create quote.json --check --json
sevdesk quotes:create quote.json --json
sevdesk quotes:create quote.json --send --json
```

**Argument:** `[quote.json]` (optional; omitted starts a customerless quote with local date and subject defaults).

**Options:** `--interactive`, `--dry-run`, `--check`,
`--send`, `--receipt`, `--json`.

In a terminal, no file starts a new quote at customer selection (Kundenauswahl),
with today's local date, an automatically suggested number, and subject (Betreff);
a positional file opens the unified quote editor (Angebotseditor), focused on the
first position (Position). Selectable rows show their current values: Enter edits,
Enter accepts a valid field locally, Escape cancels the current input. Positions
open directly into their fields; there is no separate review menu or Apply step
for existing records. Missing requirements are marked on the affected rows.
Saving in sevdesk and sending still require explicit final confirmation. Machine flags
(`--dry-run`, `--check`, `--send`, `--json`) select structured mode instead.
`--dry-run` is fully offline; `--check` makes read-only customer/address/number
checks. Neither writes. Structured creation saves directly; sending additionally requires `--send` and
valid delivery fields. Incomplete drafts can be edited and
exported locally. Existing quote numbers and receipt paths are refused before
creation. See the [complete workflow and JSON reference](docs/quotes.md) and
[invented example](examples/quote.example.json).

### `quotes:get`

Inspect an existing quote (Angebot), rejecting other sales document types.

```bash
sevdesk quotes:get 42 --positions --json
```

**Argument:** `id` (required quote ID / Angebots-ID).

**Options:** `--positions`, `--local`, `--json`.
With positions, JSON is `{ quote, positions }`; otherwise it is the quote.

### `quotes:list`

List quotes (Angebote), filtering out other order types while paginating.

```bash
sevdesk quotes:list --contact 7 --status 100 --limit 20 --json
```

**Options:** `--contact`, `--status`, `--limit`, `--local`, `--json`.
Status values: `100` draft, `200` delivered, `300` rejected/cancelled,
`500` accepted, `750` partially calculated, `1000` calculated.

### `quotes:pdf`

Download a quote preview (Angebotsvorschau) without marking it sent.

```bash
sevdesk quotes:pdf 42 --output /new/path/quote.pdf --json
```

**Argument:** `id` (required quote ID / Angebots-ID).

**Options:** `--output` (required, must not exist), `--json`.
Always uses `preventSendBy: true`; local PDF files are created with mode `0600`.

### `quotes:send`

Send an existing quote draft (Angebotsentwurf versenden), without recreating it.

```bash
sevdesk quotes:send 42 quote.json --dry-run --json
sevdesk quotes:send 42 quote.json --json
```

**Arguments:** `id` (required existing quote ID / Angebots-ID), followed by
`quote.json` (required, uses its `delivery` section).

**Options:** `--dry-run`, `--receipt`, `--json`.

The command itself requests sending and checks that the selected document is an unsent
quote draft. After a failed or ambiguous send, inspect the sending status
(Versandstatus) before retrying. Never rerun creation to retry sending. Operation
results include saved IDs and a protected local receipt (Vorgangsprotokoll).

### `tags:create`

Create a tag and attach it to a document.

```bash
sevdesk tags:create [options]
```

**Options:**

- `--name`: Name of the tag. If omitted, you will be prompted.
- `--object-type`: Type of the document to tag: `Invoice`, `Voucher`, `Order` or `CreditNote`. If omitted, you will be prompted.
- `--object-id`: ID of the document to tag. If omitted, you will be prompted.
- `--json`: Output in JSON format.

### `tags:delete`

Delete a tag.

```bash
sevdesk tags:delete [id] [options]
```

**Argument:** `id` — The tag ID. If omitted, you will be prompted.

**Options:**

- `--yes`: Skip the confirmation prompt. Defaults to `false`.
- `--json`: Output in JSON format.

### `tags:list`

List tags.

```bash
sevdesk tags:list [options]
```

**Options:**

- `--limit`: Maximum number of tags to return. Defaults to all of them.
- `--offset`: Number of tags to skip.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `transactions:create`

Create a transaction. Only use this on file import (online) check accounts.

```bash
sevdesk transactions:create [options]
```

**Options:**

- `--check-account`: The ID of the check account the transaction belongs to. If omitted, you will be prompted.
- `--amount`: The amount of the transaction. Negative for expenses. If omitted, you will be prompted.
- `--payee`: The name of the payee or payer. If omitted, you will be prompted.
- `--value-date`: The date the transaction was booked (ISO 8601). Defaults to now.
- `--entry-date`: The date the transaction was imported (ISO 8601).
- `--purpose`: The payment purpose of the transaction.
- `--status`: The status of the transaction: `100` created, `200` linked, `300` private, `400` booked. Defaults to `100`.
- `--json`: Output in JSON format.

### `transactions:get`

Show a single transaction.

```bash
sevdesk transactions:get [id] [options]
```

**Argument:** `id` — The transaction ID. If omitted, you will be prompted.

**Options:**

- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `transactions:list`

List transactions of your check accounts.

```bash
sevdesk transactions:list [options]
```

**Options:**

- `--check-account`: Only show transactions of this check account ID.
- `--unbooked`: Only show transactions with status `100` (created). Filtered client-side because the sevdesk API ignores its `isBooked=false` filter. Defaults to `false`.
- `--start-date`: Only show transactions on or after this date (ISO 8601).
- `--end-date`: Only show transactions on or before this date (ISO 8601).
- `--payee`: Only show transactions with this payee or payer name.
- `--purpose`: Only show transactions with this payment purpose.
- `--limit`: The maximum number of transactions to return. Defaults to all of them.
- `--offset`: The number of transactions to skip.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `vouchers:book`

Book a payment on a voucher. For online check accounts (bank, PayPal, file import), pass the existing bank transaction via `--transaction`. For clearing accounts and cash registers, omit `--transaction` and sevdesk creates the transaction automatically.

```bash
sevdesk vouchers:book [id] [options]
```

**Argument:** `id` — ID of the voucher. If omitted, you will be prompted.

**Options:**

- `--amount`: Amount to book. Can also be a partial amount. Pass it as a positive number — the sign is derived from the voucher, which the API requires to be negative for expense vouchers. If omitted, you will be prompted.
- `--date`: Booking date as ISO 8601. Defaults to now.
- `--type`: Type of the booking. Supported values are `FULL_PAYMENT`, `N` (partial), `CB` (cash discount), `O` (other), `OF` (reminder charges) and `MTC` (monetary traffic costs). Defaults to `FULL_PAYMENT`.
- `--check-account`: ID of the check account. If omitted, you will be prompted.
- `--transaction`: ID of the bank transaction to link. Required for online check accounts, omit for clearing accounts.
- `--create-feed`: Create a feed entry for the booking.
- `--yes`: Skip the confirmation prompt. Defaults to `false`.
- `--json`: Output in JSON format.

### `vouchers:create`

Create a voucher from a receipt file. The file is uploaded and attached to the voucher, which is created with a single position.

```bash
sevdesk vouchers:create [receipt-file] [options]
```

**Argument:** `receipt-file` — Path to the receipt file to attach, for example a PDF, an image or an XML invoice. If omitted, you will be prompted.

**Options:**

- `--status`: Status of the created voucher. Supported values are `draft` and `open`. Defaults to `open`.
- `--credit-debit`: `C` for expense (credit), `D` for income (debit) vouchers. Defaults to `C`.
- `--tax-rule`: ID of the tax rule, for example `9` for deductible input tax expenses (see [Tax rules](#tax-rules)). If omitted, you will be prompted.
- `--account-datev`: ID of the booking account (AccountDatev). Find it with [`guidance:accounts`](#guidanceaccounts). If omitted, you will be prompted.
- `--amount`: Amount of the voucher position. If omitted, you will be prompted.
- `--net`: Treat the amount as net instead of gross. Defaults to `false`.
- `--tax-rate`: Tax rate of the voucher position in percent. Defaults to `19`.
- `--voucher-date`: Date as `dd.mm.yyyy` or Unix timestamp.
- `--pay-date`: Date as `dd.mm.yyyy` or Unix timestamp.
- `--delivery-date`: Start of the service period (Leistungszeitraum), or the single service date, as `dd.mm.yyyy` or Unix timestamp.
- `--delivery-date-until`: End of the service period as `dd.mm.yyyy` or Unix timestamp. Requires `--delivery-date`.
- `--supplier-id`: ID of the supplier contact.
- `--supplier-name`: Name of the supplier, used when no supplier ID is given.
- `--description`: The voucher number.
- `--comment`: Comment for the voucher position.
- `--json`: Output in JSON format.

### `vouchers:document`

Download the document attached to a voucher.

```bash
sevdesk vouchers:document [id] [options]
```

**Argument:** `id` — ID of the voucher. If omitted, you will be prompted.

**Options:**

- `--output`: Path to write the document to. Defaults to the file name reported by the API. Existing files are never overwritten.
- `--json`: Output in JSON format.

### `vouchers:enshrine`

Enshrine a voucher so that it can no longer be changed. **This cannot be undone.**

```bash
sevdesk vouchers:enshrine [id] [options]
```

**Argument:** `id` — ID of the voucher. If omitted, you will be prompted.

**Options:**

- `--yes`: Skip the confirmation prompt. Defaults to `false`.
- `--json`: Output in JSON format.

### `vouchers:get`

Show a single voucher.

```bash
sevdesk vouchers:get [id] [options]
```

**Argument:** `id` — ID of the voucher. If omitted, you will be prompted.

**Options:**

- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `vouchers:list`

List vouchers.

```bash
sevdesk vouchers:list [options]
```

**Options:**

- `--status`: Filter by status: `50` draft, `100` open, `150` transferred, `750` partially paid, `1000` paid.
- `--credit-debit`: Filter by `C` for expense or `D` for income vouchers.
- `--description-like`: Filter by voucher number, matching partially.
- `--start-date`: Only vouchers on or after this date: `dd.mm.yyyy` or `YYYY-MM-DD` (German time), Unix seconds or an ISO 8601 timestamp.
- `--end-date`: Only vouchers on or before this date, same formats. A date includes the whole day; an exact moment is exclusive.
- `--contact`: ID of the contact whose vouchers to list.
- `--created-after`: Only vouchers created at or after this moment: Unix seconds, a date (`YYYY-MM-DD`, midnight UTC) or an ISO 8601 timestamp.
- `--created-before`: Only vouchers created at or before this moment. Same formats.
- `--updated-after`: Only vouchers last changed at or after this moment. Same formats.
- `--updated-before`: Only vouchers last changed at or before this moment. Same formats.
- `--limit`: Maximum number of vouchers to return. Defaults to all of them.
- `--offset`: Number of vouchers to skip.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `vouchers:open`

Move a draft voucher to the open status. Everything else, including the attached document and the positions, stays unchanged. Exits with an error and changes nothing unless the voucher is a draft that is not enshrined.

```bash
sevdesk vouchers:open [id] [options]
```

**Argument:** `id` — ID of the voucher. If omitted, you will be prompted.

**Options:**

- `--json`: Output in JSON format.

### `vouchers:positions`

List voucher positions.

```bash
sevdesk vouchers:positions [options]
```

**Options:**

- `--voucher`: ID of the voucher whose positions to list.
- `--limit`: Maximum number of positions to return. Defaults to all of them.
- `--offset`: Number of positions to skip.
- `--local`: Read from the [local database](#local-database) instead of the API. Defaults to `false`.
- `--json`: Output in JSON format.

### `vouchers:reset-to-draft`

Reset a voucher to the draft status. This unlinks existing payments.

```bash
sevdesk vouchers:reset-to-draft [id] [options]
```

**Argument:** `id` — ID of the voucher. If omitted, you will be prompted.

**Options:**

- `--yes`: Skip the confirmation prompt. Defaults to `false`.
- `--json`: Output in JSON format.

### `vouchers:reset-to-open`

Reset a voucher to the open status. This unlinks existing payments.

```bash
sevdesk vouchers:reset-to-open [id] [options]
```

**Argument:** `id` — ID of the voucher. If omitted, you will be prompted.

**Options:**

- `--yes`: Skip the confirmation prompt. Defaults to `false`.
- `--json`: Output in JSON format.

### `vouchers:update`

Update the service period (Leistungszeitraum) of a voucher. Options you leave out keep their stored value.

```bash
sevdesk vouchers:update [id] [options]
```

**Argument:** `id` — ID of the voucher. If omitted, you will be prompted.

**Options:**

- `--delivery-date`: Start of the service period, or the single service date, as `dd.mm.yyyy` or Unix timestamp.
- `--delivery-date-until`: End of the service period as `dd.mm.yyyy` or Unix timestamp.
- `--clear-delivery-date-until`: Remove the end of the service period, leaving a single service date. Cannot be combined with `--delivery-date-until`. Defaults to `false`.
- `--json`: Output in JSON format.

## License

See [LICENSE](https://github.com/mi-skam/sevdesk/blob/main/LICENSE).

[^1]: This project is not affiliated with, endorsed by, sponsored by, or approved by sevDesk GmbH or any of their affiliates or subsidiaries.
