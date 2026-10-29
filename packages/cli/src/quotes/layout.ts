import type { Choice } from './dialogue';
import { oneLine } from './editor';

export interface Layout {
  columns: number;
  rows: number;
  color: boolean;
}
const reset = '\x1b[0m';
function paint(text: string, code: string, color: boolean): string {
  // Static title/total/help styling is independent of option focus.
  return color ? reset + '\x1b[' + code + 'm' + text + reset : text;
}
/** Preserve consola's active/inactive contrast: inactive options inherit dim,
 * while the focused option receives the same foreground at full intensity. */
function optionStyle(text: string, code: string, color: boolean): string {
  if (!color) return text;
  const end = code.split(';').includes('1') ? '\x1b[22m\x1b[39m' : '\x1b[39m';
  return '\x1b[' + code + 'm' + text + end;
}
export function terminalColors(): boolean {
  return (
    !!process.stdout.isTTY &&
    !('NO_COLOR' in process.env) &&
    process.env.TERM !== 'dumb'
  );
}
export function compactLabel(key: string, fallback: string): string {
  const labels: Record<string, string> = {
    number: 'Number (Angebotsnummer)',
    date: 'Date (Datum)',
    validUntil: 'Valid to (Gültig bis)',
    heading: 'Subject (Betreff)',
    currency: 'Currency (Währung)',
    priceMode: 'Prices (Preisart)',
    contactPersonId: 'Contact (Ansprechpartner)',
    customerReference: 'Reference (Kundenreferenz)',
    smallSettlement: '§19 UStG (Kleinunternehmer)',
    ruleId: 'VAT rule (Steuerregel)',
    text: 'VAT text (Steuertext)',
    introduction: 'Introduction (Einleitung)',
    closing: 'Closing (Schlusstext)',
    payment: 'Payment (Zahlungsbedingungen)',
    delivery: 'Delivery (Lieferbedingungen)',
    address: 'Address (Adresse)',
    countryId: 'Country (Land-ID)',
    name: 'Name (Bezeichnung)',
    quantity: 'Quantity (Menge)',
    unitId: 'Unit (Einheiten-ID)',
    unitLabel: 'Unit name (Einheit)',
    unitPrice: 'Unit price (Einzelpreis)',
    vatRate: 'VAT % (USt-Satz)',
    discount: 'Discount % (Rabatt)',
    optional: 'Optional (Optionale Position)',
    to: 'To (Empfänger)',
    cc: 'CC (Kopie)',
    bcc: 'BCC (Blindkopie)',
    subject: 'Subject (Betreff)',
    message: 'Message (Nachricht)',
    copyToSelf: 'Copy to self (Kopie an mich)',
  };
  return labels[key] ?? fallback;
}

/** Presentation metadata only; option values and keyboard navigation never change. */
export function layoutChoices(choices: Choice[], layout: Layout): Choice[] {
  const width = Math.max(24, layout.columns - 12);
  const column = Math.min(34, Math.max(18, Math.floor(width * 0.42)));
  const groups = choices.filter(
    (choice, index) =>
      choice.group && choice.group !== choices[index - 1]?.group,
  ).length;
  // Multiline labels are supported by the existing prompt. Keep short terminals
  // to one line per option so the prompt's built-in scrolling stays usable.
  const headings = layout.rows >= choices.length + groups + 9;
  return choices.map((choice, index) => {
    if (!choice.caption && !choice.group && !choice.tone)
      return { ...choice, label: oneLine(choice.label, width) };
    const groupStart =
      !!choice.group && choice.group !== choices[index - 1]?.group;
    const indent = choice.depth ?? 1;
    // Non-breaking indentation survives the prompt's ANSI-aware word wrapping.
    // It is whitespace, not a decorative tree/pipe character.
    const prefix = '\u00a0'.repeat((headings ? 0 : 2) + indent * 2);
    const inset = headings && groupStart ? '\u00a0\u00a0' : '';
    const caption = oneLine(
      (choice.missing ? '! ' : '') + (choice.caption ?? choice.label),
      column - prefix.length - 1,
    );
    let label: string;
    if (choice.preview !== undefined) {
      const left = inset + prefix + caption.padEnd(column - prefix.length);
      const right = oneLine(choice.preview, Math.max(8, width - column - 2));
      label =
        optionStyle(
          left,
          choice.missing
            ? '33'
            : groupStart && !headings
              ? '1;36'
              : choice.tone === 'position'
                ? '1;37'
                : '37',
          layout.color,
        ) +
        '  ' +
        optionStyle(
          right,
          choice.missing ? '1;33' : choice.tone === 'position' ? '1;97' : '97',
          layout.color,
        );
    } else {
      const code =
        choice.tone === 'primary'
          ? '1;32'
          : choice.tone === 'danger'
            ? '37'
            : '36';
      label = optionStyle(
        inset +
          prefix +
          oneLine(choice.caption ?? choice.label, width - prefix.length),
        code,
        layout.color,
      );
    }
    if (groupStart) {
      const heading = oneLine(choice.group, width - 6);
      const rule = optionStyle('── ' + heading + ' ──', '1;36', layout.color);
      if (headings) label = rule + '\n' + label;
      // Short terminals retain the colored group-start caption and indentation,
      // without adding any rows to the existing prompt's scrolling viewport.
    }
    return { ...choice, label };
  });
}
export function layoutMessage(message: string, color: boolean): string {
  if (!message.startsWith('Quote editor')) return message;
  return message
    .split('\n')
    .map((line, index) => {
      if (!index) return paint(line, '1;36', color);
      const total = line.indexOf('Total (Gesamtbetrag):');
      if (total >= 0)
        return (
          paint(line.slice(0, total), '0', color) +
          paint(line.slice(total), '1;32', color)
        );
      return paint(line, '90', color);
    })
    .join('\n');
}
