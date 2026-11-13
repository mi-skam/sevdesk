# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Live API safety (strict)

The CLI runs against a real sevdesk account.

- Read-only commands (`*:list`, `*:get`, `accounts:balance`, `guidance:accounts`, `doctor`, `export:*`, `db:info`) may be run freely.
- `db:sync` only reads from the API but writes real account data into a local SQLite file. When trying it, point `SEVDESK_DB` at a scratch path outside the repo rather than the user's default database, unless asked otherwise. Never commit a database file.
- **Never run a command that writes** — `*:create*`, `*:update`, `*:delete`, `vouchers:book`, `vouchers:enshrine`, `vouchers:reset-to-*`, `login`, `logout` — without asking first and getting an explicit yes for that specific run. Enshrining cannot be undone.
- **Never read, print or copy the API token.** Do not open `~/.config/sevdesk/config.json` and do not echo `SEVDESK_TOKEN`. Touch the account only through the CLI.

## Commands

```bash
npm install
npm run build                 # tsdown build in every workspace
npm test                      # vitest run in every workspace
npm run typecheck             # tsc --noEmit in every workspace
npm run lint                  # eslint . && prettier --check .
npm run fmt                   # eslint --fix . && prettier --write .

npm test -w @mi-skam/sevdesk-sdk -- vouchers      # single test file (vitest name filter)
npm test -w @mi-skam/sevdesk -- --watch

node packages/cli/dist/index.js <command>          # run the built CLI locally
```

CI runs `build`, `lint`, `typecheck`, `test`, `test:terminal`, `release:pack` and `release:verify` on Node 22 and 24. Node >= 22.13 is required for the CLI, >= 22 for the SDK.

## Architecture

npm workspaces monorepo with two published packages. **The CLI is a thin layer over the SDK — never call the sevdesk API directly from CLI code.**

### `packages/sdk` — `@mi-skam/sevdesk-sdk`

Zero runtime dependencies, native `fetch`, ESM only.

- `src/http-client.ts` — the only place that talks to the network. Owns auth (raw token in `Authorization`, no `Bearer`), timeouts via `AbortSignal.timeout`, retries (GET/PUT/DELETE only, on network errors + 429/5xx, honoring `Retry-After`), query serialization (`booleans → 1/0`, arrays → comma-joined) and unwrapping of the sevdesk `{ objects: … }` envelope. `request<T>()` returns the unwrapped payload; empty bodies return `undefined`.
- `src/resources/*.ts` — one class per API area, each extending `BaseResource` and receiving the shared `HttpClient`. `SevDesk` in `src/client.ts` instantiates all of them as readonly properties.
- `src/types.ts` — shared `DateInput`, `ListOptions`, `ModelRef` (requests, numeric id) vs `ModelRefResponse` (responses, string id).
- `src/dates.ts` — serializers because endpoints disagree: `toVoucherDate` (`dd.mm.yyyy` or Unix seconds, for request bodies), `toIsoDateTime`, `toPlainDate`, and `toFilterStart`/`toFilterEnd` for the `startDate`/`endDate` list filters of Voucher, Invoice, Order and CreditNote. Those filters accept a `dd.mm.yyyy` string but ignore it (start matches everything, end nothing), so the filter serializers always send Unix seconds: a calendar day becomes midnight / the last second of that day in Europe/Berlin, the zone sevdesk stores document dates in, which also makes the exclusive voucher `endDate` include the whole day. Unreadable strings throw before any request.
- `src/index.ts` re-exports everything; new resources must be added there.

### `packages/cli` — `@mi-skam/sevdesk` (bin `sevdesk`)

Built on `zodline` + `zod` + `consola`.

- `src/index.ts` — registers every command in a flat `commands` map keyed `group:action` (e.g. `vouchers:book`). New commands must be imported and registered here. Top-level try/catch funnels all errors through `formatError`, then sets exit code 1.
- `src/commands/<group>/<action>.ts` — one `defineCommand({ description, options: defineOptions(z.object({…})), action })` per file, default-exported.
- `src/client.ts` — `requireClient()` resolves the token and exits with a hint if absent; `createClient()` sets the CLI `User-Agent`.
- `src/config.ts` — token resolution order: `SEVDESK_TOKEN` env var → `~/.config/sevdesk/config.json` (respects `XDG_CONFIG_HOME`, written with mode `0600`). No OS keyring.
- `src/options.ts` / `src/prompt.ts` / `src/interactive.ts` — `requireStringOption`/`requireNumberOption`/`confirmOrAbort` prompt when interactive and exit 1 with an explanatory message when not. Non-interactive = no TTY or `CI` set.
- `src/output.ts` — `printJson`, `printTable`, `contactLabel`.
- `src/store.ts` — the local SQLite database via built-in `node:sqlite` (Node ≥ 22.13), loaded lazily with its experimental warning suppressed. Path: `SEVDESK_DB` → `$XDG_DATA_HOME/sevdesk/sevdesk.db` → `~/.local/share/sevdesk/sevdesk.db`, mode `0600`. One generic `records` table keyed `(entity, id)` stores each API object unchanged in `data`, plus `updated_at`/`created_at` (normalized `toISOString()`, so text order is time order) and `deleted_at`. The `changes` table (schema v2) logs every insert, data change, deletion and restore a sync writes, with the record before (`previous`) and after (`data`); `db:history` reads it. `syncStore` passes `log: false` on an entity's first sync, so the initial import is not logged. Schema version in `PRAGMA user_version`; `MIGRATIONS[n]` upgrades version `n` to `n + 1` inside one transaction, so a schema change is a new array entry, never an edit of an old one. Read commands open it with `create: false` and fail with a hint to run `db:sync`.
- `src/local.ts` — `--local` support: `readLocal`/`readLocalRecord` (a deleted record is returned with a warning, a never-synced one is an error), `localList` (applies `where` ≙ server-side filters, then `offset`, then `keep` ≙ the live command's client-side filter, then `limit`, exactly like `fetchAll`), and matchers that reproduce the API's filter semantics. Every list/get command for a synced entity takes `--local` and branches `if (options.local) … else { <live code> }`; local reads never call `requireClient`, so they need no token. Parity with live output was checked command by command against a live account; keep it when changing a filter.
- `src/sync.ts` — `ENTITIES` lists every synced entity with the embeds the list/get commands use, so local data equals live output. `syncStore` fetches everything first, then writes in one transaction. Entities with an `updateAfter` filter (contacts, invoices, orders, vouchers) are incremental from `watermark − 1 h` (per entity in `sync_state`), with a full fetch at least weekly or on `--full`; all others are fetched in full every run. Only full fetches mark unseen records deleted; records are never removed. `403` skips an entity.
- `src/errors.ts` — maps `ZodlineError`, `ZodError` and `SevDeskError` (401 → "run `sevdesk login`") to user-facing strings.

## Conventions

- **Hand-written types only.** `openapi.yaml` is a local reference download, not a codegen source — it is wrong about media types, `voucherPosSave`, pagination and filters. Never generate code from it, nor from `openapi.patched.yaml`.
- `openapi.overlay.yaml` (OpenAPI Overlay 1.0, versioned) records every verified correction to the spec; `npm run openapi:patch` (`scripts/apply-openapi-overlay.mjs`) applies it to `openapi.yaml` and writes the gitignored `openapi.patched.yaml`, failing when a target no longer matches upstream. When you verify new API behavior, add it to the overlay as well as to the API quirks below; mark anything not verified live as unverified.
- **Bookkeeping system 2.0 only** (`taxRule`, `accountDatev`). 1.0 accounts are rejected by `login` and flagged by `doctor`.
- SDK methods take a single options object and are documented with a one-line JSDoc naming the endpoint (`/** Retrieves vouchers via \`GET /Voucher\`. */`). Non-obvious API behavior belongs in JSDoc on the affected field.
- The sevdesk API returns all scalars as strings, including ids — response interfaces reflect that.
- Endpoints that return a single object still return an array; resources take `[0]` and throw a synthetic `SevDeskError` 404 when empty.
- **Every CLI command supports `--json`**; destructive ones support `--yes`. Exit codes are `0`/`1` only. These are the automation primitives the separate matching-automation repo depends on — do not break them.
- CLI list commands print a table by default and `consola.info('No … found.')` on empty results.
- Documenting a new command means adding it to the list _and_ the reference section in `packages/cli/README.md`; new SDK resources go in the resources table in `packages/sdk/README.md`.

## API quirks to preserve

- List endpoints default to `limit=100` when no limit is sent, which silently truncates. CLI list commands therefore page through `fetchAll` (`packages/cli/src/pagination.ts`) instead of issuing a single request; it stops on an empty page, not a short one, so a server-side cap cannot truncate either. SDK `list` methods stay 1:1 with the endpoint and do not paginate.
- `limit` must be an integer from 1 to 1000; anything else (above 1000, below 1, non-integer) is `400` "Invalid 'limit' parameter" since 30.05.2025. `fetchAll`'s page size of 1000 is therefore the maximum — never raise it.
- The token is accepted only in the `Authorization` header; passing it as a query parameter was removed on 29.04.2025.
- `GET /Export/datevCSV` was removed on 30.05.2025, although the spec still lists it. DATEV exports go through `createDatevCsvZipExportJob` → job progress → download. `POST /CreditNote/Factory/createFromVoucher` is likewise listed but gone in bookkeeping 2.0. Do not add either.
- Since 07.04.2026 `render`, `changeParameter` and `sendByWithRender` on Invoice, Order, CreditNote and Letter return the whole document as Base64 in `pdf`; the former `thumbs` (one image per page) and `pages` are gone.
- `GET /DocServer/getTemplatesWithThumb` and `/getLetterpapersWithThumb` answer without the `objects` envelope (`{ result, templates }` / `{ result, letterpapers }`). The `type` filter is case-sensitive: the spec's `invoicereminder` matches nothing, the data says `Invoicereminder`. A template's `default` comes back as a boolean or a number; both carry fields the spec omits (`isCustom`, `img`, `inactive`, `structure`, `pdfreactorVersion`). Verified live. `changeParameter` and `CreditNote/sendByWithRender` are unverified; the latter is a `GET` that marks the credit note as sent, so `credit-notes:print` confirms first.
- Some validation errors on orders, invoices, vouchers and credit notes come back as `500` instead of `422` (acknowledged by sevdesk as a bug). Because `PUT`/`DELETE` are retried on `5xx`, such an error is retried before it surfaces; it is not an outage.
- In bookkeeping 2.0, `enshrined` and invoice/credit-note `status` cannot be set directly (use `/enshrine`, `bookAmount` and the send endpoints), new vouchers can only be `50` or `100`, and quotes, orders and delivery notes with a negative total are rejected.
- Source for these: the sevdesk API news at https://tech.sevdesk.com/api_news/ — check it when an endpoint behaves unexpectedly.
- `GET /CheckAccountTransaction` ignores `isBooked=false`; `transactions:list --unbooked` filters client-side on `status === '100'`. Client-side filters make `fetchAll` request full pages so `--limit` still returns the requested number of rows.
- `/AccountDatev` is **undocumented**. `list` returns only non-hidden accounts and ignores every filter except `limit`/`offset`; `get` reaches hidden accounts. The documented alternative, `ReceiptGuidanceResource`, only covers the VAT-relevant subset.
- `GET /Voucher`, `/Invoice`, `/Order` and `/Contact` accept `createAfter`/`createBefore`/`updateAfter`/`updateBefore` (documented only in the spec's prose). Verified live: Unix seconds work, and the bounds are **inclusive** (`>=`/`<=`) despite the names. No other list endpoint has a change filter.
- Filter and order semantics reproduced by `--local` (verified live): `contact[id]` also matches persons whose `parent` is that organization; `GET /Invoice` without `showAll` hides `invoiceType` `MA` (reminders) and `WKR` (recurring); `GET /Contact` at the default depth returns organizations only (contacts with a `name`); `GET /Voucher` treats an instant `endDate` as exclusive while invoices, orders and transactions include it. Default order: vouchers by `voucherDate` desc, transactions by `valueDate` desc, DATEV accounts by `number` as text, accounting contacts by contact ID (name-only first), check accounts default-first then ID asc, voucher positions ID asc, everything else ID desc; ties come back in arbitrary order.
- `GET /CheckAccount/{id}/getBalanceAtDate` answers `"-0"` for an account whose transactions cancel out (verified live); the SDK passes it through, `accounts:balance` prints `0`.
- `GET /AccountDatev` returns `create`/`update` as `null` for standard accounts, `GET /AccountDatev/{id}` returns timestamps.
- `AccountingContact` (verified live): a record either references a `contact` or, when it belongs to a bare name such as a voucher supplier entered without a contact, omits `contact` entirely and carries `contactName` (not in the spec, nor is `additionalInformation`). `GET /AccountingContact` orders by contact ID, name-only records first by ID. sevdesk warns that updating or deleting one can break bookings and the DATEV export, so the CLI confirms both. `embed=contact` works on list and get and changes neither order nor the `contact[id]` filter; the CLI embeds it everywhere, sync included, to show names.
- `GET /ContactCustomField` accepts `contact[id]` (not in the spec) and rejects an ID that is no contact with "No Model_Contact with the id … was found"; `--local` returns an empty list instead. The response shape, order and the write endpoints of `ContactCustomField`/`ContactCustomFieldSetting` are unverified (the test account has none); the spec types some `POST` results as arrays, so the SDK accepts both.
- Payment links between vouchers and transactions are not exposed by any endpoint (`object[]` filter and CSV export both verified). Do not add lookups that pretend otherwise.
- `PUT` with `mapAll: true` is a genuine partial update: fields left out of the body keep their stored value. Verified live on `/ContactAddress` by updating only `street` and reading `zip`, `city`, `country` and `category` back unchanged, so update commands can send bare partials instead of read-modify-write.
- `VoucherPos.accountDatev` is `null` for legacy bookkeeping-1.0 positions, which carry `accountingType` instead.
- Voucher save uses `POST /Voucher/Factory/saveVoucher` with `mapAll: true` and `voucherPosDelete: null`; file uploads go through `POST /Voucher/Factory/uploadTempFile` first.
- `bookAmount` takes the amount **as it flows over the check account**: negative for expense vouchers (`creditDebit: 'C'`), positive for revenue vouchers. A positive amount on an expense voucher is accepted and stored as a negative `paidAmount`, leaving the voucher at status `750` with `payDate: null` — silently wrong, no error. The SDK stays 1:1 and expects the signed amount; `vouchers:book` takes a positive `--amount` and applies the sign from the voucher it fetches first.

## Testing

Vitest, no network. SDK tests build a resource on an `HttpClient` with a mocked `fetch` (`test/helpers.ts`: `createMockFetch`, `createHttpClient`, `lastRequest`) and assert on the exact request URL and JSON body. CLI tests import the command module directly, `vi.stubGlobal('fetch', …)`, mock `../src/interactive` and `../src/prompt`, and assert on requests plus `process.exit` behavior. Database tests set `SEVDESK_DB` (or pass `path`) to a file in a fresh `mkdtemp` directory. Add tests alongside every new resource method and command.

**Fixtures are always invented, never real.** Never paste a live API response into a test, a doc or a commit — no real ids, names, IBANs, amounts, purposes or account numbers from an actual sevdesk account. Never commit a database file. Make fixtures obviously fake (`ACME`, `RE-1`, published test IBANs) and keep any live output you capture while debugging outside the repo.

## Releases

release-please manages a single root component (`.`) with `include-component-in-tag: false`; `extra-files` bump both package versions, the CLI's pinned SDK dependency and the workspace entries in `package-lock.json`. Conventional commits drive versioning and the root `CHANGELOG.md` (the per-package changelogs are frozen history from before 0.3.0). **Nothing is published to npm** — releases are GitHub releases only. Merging the release PR, or merging any PR labelled `release` (the workflow then waits for the release PR's checks, merges it with its own token and runs release-please a second time with `skip-github-pull-request`), makes `.github/workflows/release.yml` tag `vX.Y.Z`, create the GitHub release as a draft (`draft` + `force-tag-creation`, because immutable releases are enabled and a published release rejects new assets) and call `.github/workflows/github-release.yml`, which checks out the tag, builds, tests, runs `scripts/package-release.mjs` (SDK tarball + CLI tarball with the exact SDK bundled, plus `SHA256SUMS`; checks `RELEASE_TAG` against the versions) and `scripts/verify-release.mjs` (isolated install and offline smoke tests), attaches the files and then publishes the release. Run it by hand with `gh workflow run github-release.yml -f tag=vX.Y.Z` to finish a release that is still a draft; a published release can no longer take assets. Both packages share a version. `save-exact=true` — all dependency versions are pinned. Changelogs are generated and excluded from prettier.
