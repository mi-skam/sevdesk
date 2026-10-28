# Quotes (Angebote)

The CLI provides a human dialogue and a deterministic file interface over the
same versioned document model. Quote commands use the existing SDK `orders`
resource with type `AN`. They do not alter customer records or catalogue entries.

## Interactive creation (Angebot erstellen)

```bash
sevdesk quotes:create
sevdesk quotes:create quote.json --interactive
```

A terminal is required. There is no start/template screen:

- Without a file, start at customer selection (Kundenauswahl), then open the
  unified quote editor (Angebotseditor).
  Today's local date (Angebotsdatum), a suggested quote number (Angebotsnummer),
  and `Angebot Nr. <number>` as the subject (Betreff) are prefilled. A number
  lookup failure is shown; manual entry remains possible, with no guessed counter.
  Currency, tax, contact-person IDs and account text templates are not inferred
  from historical invoices or silently hardcoded as account defaults.
- With a positional file, open the quote editor directly, focused on the first
  position when available. The customer name is looked up without changing the
  imported customer identity, address, or recipients; lookup failure does not
  block local editing.
- In a terminal, the dialogue is the default unless machine-action flags are present.
  `--interactive` may also request it explicitly.

The customer picker loads customer-category contacts with pagination, includes
persons, groups linked persons beneath organizations, searches cached names and
numbers, hides non-active contacts by default, and supports refresh and retry.
The pinned **No customer yet (Kein Kunde)** option creates no dummy contact.
Addresses load only after selection. A selected or overridden recipient address
(Empfängeradresse) affects this document only. An empty search shows all contacts;
refresh and the inactive toggle keep the current search. Reselecting the same
customer preserves the current address and email recipients. Changing to a
different customer (or Kein Kunde) clears the old address override and To/CC/BCC
recipients so they cannot silently carry over to another customer.

The quote editor (Angebotseditor) is a single value-oriented screen: each
selectable row contains the field label and its current value. There is no
separate list of “Edit …” actions and no positions-to-review navigation step.
Totals (Summen) appear in the editor heading and update after accepted edits.
The existing select prompt uses aligned label/value columns, indented fields,
cyan section headings, bright focused-row text, bold position summaries,
and green save/send actions. Captions and values inherit the prompt's native
inactive dimming, so focus highlights the text as well as the cursor. Sections
use whitespace indentation without decorative vertical stems. Concise labels retain the German business terms.
Short terminals use compact section emphasis instead of extra heading lines so
built-in scrolling still works. `NO_COLOR` disables the added ANSI styling;
indentation and alignment do not depend on color.

- **↑/↓** selects a value; **Enter** opens it for editing.
- **Enter** accepts a valid field edit into the local draft immediately.
  Existing records do not need a second Apply step.
- **Escape/Ctrl+C in a field** cancels only that input. Earlier accepted edits
  remain intact. Returning from a position screen also preserves accepted edits.
- **Escape/Ctrl+C in the editor** exits if unchanged; otherwise offers
  export/discard/back. An unchanged edit does not make the draft dirty.
- Empty optional text clears the field. Multiline inputs use literal `\\n` for
  line breaks; rows show compact previews rather than dumping entire paragraphs.
- The cursor returns to the same field after an edit or cancelled input.
  New, duplicated, moved, or restored positions receive the focus.

Select a position (Position) to open its name, description, quantity, unit,
unit price, VAT, discount, and optional flag together with their current values.
There is no intermediate Edit menu. Duplication, removal and movement actions
are on that same position screen; impossible moves are hidden. Removal can be
undone from the quote editor, restoring the original index.

New positions and new recipient addresses can require several fields. An
unfinished new entry stays staged, rather than putting an invalid record into
the quote. Adding a position requires completing it and selecting
**Add position to quote (Position zum Angebot hinzufügen)**. Cancelling a changed,
unfinished entry asks before discarding it. Existing catalogue HTML descriptions
are shown as stored text; replace markup with plain text when appropriate.

Changing the price mode (Preisart) with existing positions requires an explicit
choice: convert unit prices, reinterpret the entered numbers, or keep the current
mode (the safe default). Converted prices are rounded to four decimal places;
review the resulting totals. Catalogue copying asks for a missing price mode and
commits it only when the new position is added.

Missing required values are marked on their own rows. Selecting Save while the
quote is incomplete explains the requirements and focuses the first affected
field; it does not contact the account or save anything. An omitted number is
displayed as automatic and resolved on an otherwise complete save. An explicit
number-refresh action is available after a collision; no number is reserved.

Interactive validation uses business terms (Angebotsbegriffe), not JSON paths
such as `document.number` or `tax.ruleId`. Field errors use the visible labels;
position errors use one-based numbering. Structured JSON errors retain technical
paths for automation.

The same editor offers:

- **Save draft in sevdesk (Entwurf in sevdesk speichern)**: validate, perform
  account/customer/address and duplicate-number checks, then explicitly confirm
  saving an editable quote without sending.
- **Save and send (Speichern und versenden)**: available after local save
  requirements pass. Edit email values, choose **Review email (E-Mail prüfen)**,
  inspect all recipients, the message and quote PDF attachment, then confirm
  sending explicitly.
- **Export JSON (JSON exportieren)**: write a local file, including incomplete,
  customerless drafts. Existing files are never overwritten.
- **Exit (Beenden)**: accepted changes stay local until save/send is explicitly
  confirmed; unsaved changes offer export/discard/back.

Accepting a field edit never saves or sends anything in sevdesk. An exported file
can be reopened with `quotes:create quote.json` in a terminal.

## Structured mode

```bash
# Offline preview; no credentials or API requests
sevdesk quotes:create quote.json --dry-run --json

# Customer/address and duplicate-number preflight; read-only API requests
sevdesk quotes:create quote.json --check --json

# Save draft only
sevdesk quotes:create quote.json --json

# Save and explicitly send using the delivery section
sevdesk quotes:create quote.json --send --json
```

Structured mode never prompts. Omitted `quote.json` means a customerless local
quote with today's local date and `Angebot` as the provisional subject:
`quotes:create --dry-run --json` previews it offline. Saving a quote without its
other required information fails validation before authentication. A bare invocation without a terminal
needs machine flags such as `--dry-run --json`.
Interactive mode rejects machine-action flags (`--send`, `--dry-run`,
`--check`, `--json`); final choices happen inside the dialogue instead.

`--dry-run` accepts incomplete drafts and reports `readyToSave`, field issues,
indicative totals and email readiness. `numbering.pending` identifies an omitted
number; `readyToResolveNumber` means the other local save requirements pass.
An unresolved number keeps `readyToSave` false in the offline preview; no account
lookup is made until `--check` or actual creation. It does not promise account validity.
`--check` requires a complete saveable document. It resolves the customer,
recipient address and duplicate quote number, but does **not** verify foreign
user/unit/tax IDs or establish tax correctness. The API validates these at save.

## quote.json, version 1

See [`quote.example.json`](../examples/quote.example.json) for a
complete invented example. All account-specific IDs are placeholders.

```json
{
  "schemaVersion": 1,
  "customer": { "number": "C-EXAMPLE" },
  "document": {
    "number": "AN-EXAMPLE",
    "date": "2024-02-29",
    "validUntil": "2024-03-31",
    "heading": "IT infrastructure review",
    "currency": "EUR",
    "priceMode": "net",
    "contactPersonId": 8
  },
  "tax": { "ruleId": 1, "text": "Umsatzsteuer 19%" },
  "positions": [
    {
      "name": "Example consulting",
      "description": "Assessment and recommendations",
      "quantity": "8",
      "unit": { "id": 1, "label": "hours" },
      "unitPrice": "100.00",
      "vatRate": "19"
    }
  ],
  "texts": {
    "introduction": "Thank you for your enquiry.",
    "closing": "Please contact us with any questions."
  },
  "terms": {
    "payment": "Payment within 14 days of invoicing.",
    "delivery": "By arrangement."
  },
  "delivery": {
    "to": "customer@example.com",
    "subject": "Angebot {{number}}",
    "message": "Guten Tag,\n\nanbei erhalten Sie unser Angebot {{number}}.",
    "copyToSelf": false
  }
}
```

### Field rules

- Input and exported JSON files are limited to 1 MiB.
- `schemaVersion`: required, currently `1`. Unknown keys are rejected at every
  level, including document IDs, lifecycle status and caller-supplied totals.
- `customer`: exactly `{ "number": "…" }`, `{ "id": 7 }`, or `null`. Saving
  requires an active customer. When a number is shared by an organization and its
  linked person, the organization is selected; otherwise ambiguous matches fail.
- `recipient`: optional document-only override:
  `{ "address": "Name\nStreet\nPostcode City", "countryId": 1 }`. Without an
  override, exactly one complete stored address must exist; multiple or incomplete
  addresses require explicit selection. Never edits the customer record.
- `document.number`: required **before saving**, because the existing SDK requires
  `orderNumber`, but it may be omitted or blank in input. Creation and `--check`
  then resolve it through the account's numbering configuration and all existing
  numbers, including drafts. The editor prefills it for new quotes; imported
  incomplete files resolve it on review once their other required fields are
  complete. Explicit numbers are preserved. Use **Suggest next quote number
  (Nächste Angebotsnummer vorschlagen)** to refresh a stale suggestion.
  The rule is numeric highest used + 1, respecting a higher configured starting
  counter. Only a literal format with exactly one `%NUMBER` is supported;
  unknown date/reset tokens require explicit entry, never guesswork. Zero padding
  in the configured counter is retained. No number is reserved. A duplicate
  found before confirmation/saving returns an error rather than silently
  renumbering or retrying. Concurrent external creation is still possible.
- `document.date`, `validUntil`: valid `YYYY-MM-DD` dates; expiry must not precede
  the quote date. Validity (Gültigkeit) is appended visibly as `Gültig bis:
DD.MM.YYYY` to the closing text, because the SDK has no validity-date property.
- `document.heading`, `currency`, `priceMode`, `contactPersonId`: required before
  saving. The internal contact person ID is a **SevUser**, not the recipient's
  contact ID. The SDK currently has no user/unit lookup resource: resolve these
  IDs from verified existing records. Currency must be an ISO currency with two
  decimal places in the runtime's currency list.
- `document.customerReference`, `smallSettlement`: optional. The small entrepreneur
  scheme (Kleinunternehmerregelung) requires zero VAT in all positions.
- `tax.ruleId`, `tax.text`: required before saving, never guessed from a customer.
- `positions`: at least one before saving. Each requires name, quantity, unit ID,
  unit price and VAT rate. Quantity, prices, rates and discounts use **decimal
  strings**, not JSON floats or localised currency text. Maximum 12 integer and
  four fractional digits; quantity must be positive; percentage fields are 0–100.
- `positions[].description`, `unit.label`, `discount`, `optional`: optional. Labels
  are display-only; unit IDs are what the SDK uses. Positions are automatically
  numbered in their displayed order. Catalogue values are copied, not linked for
  subsequent edits.
- `texts`, `terms`, position descriptions, and email messages are **plain text**.
  The adapter escapes HTML and preserves line breaks. Export never exposes tokens.
- `delivery`: optional for drafting; required for sending. Requires one `to`
  address, `subject`, and `message`. Optional `cc`/`bcc` are arrays of addresses;
  `copyToSelf` is boolean. `{{number}}` in subject/message is replaced with the
  saved quote number. Delivery content in the file **does not enable sending**:
  structured creation still needs `--send`.

An incomplete local draft can be as small as:

```json
{ "schemaVersion": 1, "customer": null, "positions": [] }
```

### Totals (Summen)

Previews use decimal arithmetic, round positions to two decimal places, account
for percentage discounts, and show optional positions separately, excluded from
indicative totals. Net/gross interpretation is explicit. Preview totals are not
accounting certification: sevdesk's saved totals and rendering remain authoritative,
particularly for optional positions and account-specific rounding/tax rules.

## Read-only numbering suggestion (Nummernvorschlag)

```bash
sevdesk numbering:get --kind quote --suggest --json
sevdesk numbering:get --kind invoice --suggest --json
```

These commands report `nextNumber`, `highestExistingNumber`, `configuredCounter`,
`format`, and `reserved: false`, using the same numbering logic as creation.

## Saving, sending and recovery

Every write operation has a local operation receipt (Vorgangsprotokoll), stored
with permissions `0600` below `${XDG_STATE_HOME:-~/.local/state}/sevdesk/quotes/`.
Supply `--receipt /new/path.json` to choose an explicit path. An existing receipt
is refused before any POST. Receipts contain IDs/state, not credentials or the
email body. Reuse an explicit receipt path to guard against inadvertently
repeating the same creation command.

Creation and sending are separate operations. POSTs are never automatically
retried. Machine results include `state`, `orderId` when known, `orderNumber`, and
`receipt`, and `draftFile` for creation. Before the creation POST, a complete
recovery draft (Wiederherstellungsentwurf) is saved next to the receipt as
`<receipt-path>.quote.json`, also with permissions `0600` and no overwriting.
Unlike the receipt, **this recovery file includes the quote, addresses and email
content**; keep it private. Its path is printed even for an unknown outcome.
It preserves interactive work if saving or sending fails. Inspect the receipt
and remote state first: a recovery file is not permission to recreate a quote
whose creation may already have succeeded. Use it with `quotes:send --id …` for a
verified unsent existing draft. Successful creation returns `saved`; acknowledged sending returns
`sent`. A send acknowledgement is **not proof of inbox delivery**.

- `creation-unknown`: check sevdesk for the chosen number before retrying.
- `send-unknown`: the saved quote ID is preserved; a read-only status check is
  attempted. **Do not rerun creation.** Inspect the document's sending status
  (Versandstatus) first.
- Unknown/failed operations exit with code `1` while retaining structured output.
- A network timeout is not proof that creation or sending did not happen.

After checking a failed send, send **the existing draft**, without recreating it:

```bash
sevdesk quotes:get --id 42 --positions --json
sevdesk quotes:send quote.json --id 42 --dry-run --json
sevdesk quotes:send quote.json --id 42 --json
```

`quotes:send` refuses non-quotes, non-drafts and records already carrying a send
date. There is deliberately no forced resend flag.

## Read-only commands

```bash
sevdesk quotes:list --json
sevdesk quotes:list --contact 7 --status 100 --limit 20 --json
sevdesk quotes:get --id 42 --positions --json
sevdesk quotes:pdf --id 42 --output /new/path/quote.pdf --json
```

Listing filters `AN` records client-side while paginating. PDF preview always
passes `preventSendBy: true` and refuses overwriting existing files. Reading a
quote or downloading its preview never intentionally marks it as sent.

## Verification boundary

The implementation is covered by mocked SDK/API tests, scripted dialogue tests,
and real-terminal regression journeys. From the repository root:

```bash
npm test
npm run test:terminal
```

The terminal suite needs Python 3 on macOS/Linux. It builds the CLI, runs the real
prompt renderer in a PTY and submits real keyboard input. All HTTP calls are
intercepted with invented fixtures; the suite supplies a fake credential, never
reads account credentials, writes only into temporary directories, and cannot
create live quotes or send real emails. CI runs it on Node 22 and 24.

These tests do not verify the live API's undocumented behaviour. No live quote
was created and no email sent during implementation. Validate the first real
saved draft and its PDF in your account before relying on document formatting,
numbering behaviour or optional-position totals.
