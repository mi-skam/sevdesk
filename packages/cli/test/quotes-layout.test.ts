import { stripVTControlCharacters } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Choice } from '../src/quotes/dialogue';
import {
  compactLabel,
  layoutChoices,
  layoutMessage,
  terminalColors,
} from '../src/quotes/layout';

const choices: Choice[] = [
  {
    value: 'customer',
    label: 'Customer',
    caption: 'Customer (Kunde)',
    preview: 'ACME',
    group: 'Recipient (Empfänger)',
    depth: 0,
  },
  {
    value: 'address',
    label: 'Address',
    caption: 'Address (Adresse)',
    preview: 'Example Street',
    group: 'Recipient (Empfänger)',
  },
  {
    value: 'number',
    label: 'Number',
    caption: 'Number (Angebotsnummer)',
    preview: 'AN-EXAMPLE',
    group: 'Quote (Angebot)',
  },
  {
    value: 'save',
    label: 'Save',
    caption: 'Save in sevdesk (Entwurf speichern)',
    group: 'Actions (Aktionen)',
    tone: 'primary',
    depth: 0,
  },
];
afterEach(() => vi.unstubAllEnvs());
describe('existing prompt visual hierarchy', () => {
  it('adds group headings and indentation without adding selectable entries or changing navigation values', () => {
    const formatted = layoutChoices(choices, {
      columns: 120,
      rows: 45,
      color: false,
    });
    expect(formatted.map((choice) => choice.value)).toEqual(
      choices.map((choice) => choice.value),
    );
    expect(formatted[0]!.label).toContain('── Recipient (Empfänger) ──\n');
    expect(formatted[1]!.label).toMatch(/^\s{2}Address/);
    expect(formatted.every((choice) => !/[│┃]/.test(choice.label))).toBe(true);
    expect(formatted[2]!.label).toContain('── Quote (Angebot) ──');
    expect(formatted[3]!.label).toContain('── Actions (Aktionen) ──');
    expect(choices[0]!.label).toBe('Customer');
  });
  it('aligns field values independently of label length and indentation', () => {
    const formatted = layoutChoices(choices, {
      columns: 120,
      rows: 45,
      color: false,
    });
    // First entries use whitespace in place of the prompt's two-character bullet;
    // subsequent options receive that bullet from the prompt itself.
    const customer = formatted[0]!.label.split('\n')[1]!;
    const address = '○ ' + formatted[1]!.label;
    expect(customer.indexOf('ACME')).toBe(address.indexOf('Example Street'));
  });
  it('keeps short terminal layouts one line per option with readable values', () => {
    const formatted = layoutChoices(choices, {
      columns: 80,
      rows: 12,
      color: false,
    });
    for (const choice of formatted) {
      expect(choice.label).not.toContain('\n');
      expect(choice.label.length).toBeLessThanOrEqual(74);
    }
    expect(formatted.every((choice) => !/[│┃]/.test(choice.label))).toBe(true);
    expect(formatted[0]!.label).toContain('ACME');
    expect(formatted[0]!.label.indexOf('ACME')).toBe(
      formatted[1]!.label.indexOf('Example Street'),
    );
  });
  it('preserves native focus contrast and emphasizes primary actions', () => {
    const formatted = layoutChoices(choices, {
      columns: 120,
      rows: 45,
      color: true,
    });
    expect(formatted[0]!.label).toContain('\x1b[1;36m');
    expect(formatted[0]!.label).toContain('\x1b[97mACME');
    expect(formatted.every((choice) => !choice.label.includes('\x1b[0m'))).toBe(
      true,
    );
    expect(formatted[3]!.label).toContain(
      '\x1b[1;32m\u00a0\u00a0Save in sevdesk',
    );
    expect(stripVTControlCharacters(formatted[0]!.label)).toContain(
      'Customer (Kunde)',
    );
  });
  it('makes both caption and value brighter on focus, including the first field beneath a heading', () => {
    const formatted = layoutChoices(choices, {
      columns: 120,
      rows: 45,
      color: true,
    });
    const dimBefore = (text: string, word: string) => {
      let dim = false;
      for (const part of text
        .slice(0, text.indexOf(word))
        .split('\x1b[')
        .slice(1)) {
        const codes = part.split('m')[0]!;
        if (!/^[\d;]*$/.test(codes)) continue;
        for (const code of codes.split(';').map(Number)) {
          if (code === 0 || code === 22) dim = false;
          if (code === 2) dim = true;
        }
      }
      return dim;
    };
    // This is how the existing consola renderer wraps inactive (not active) labels.
    for (const [index, words] of [
      [0, ['Customer (Kunde)', 'ACME']],
      [1, ['Address (Adresse)', 'Example Street']],
      [3, ['Save in sevdesk']],
    ] as const) {
      const active = formatted[index]!.label;
      const inactive =
        '\x1b[2m' +
        active.replaceAll('\x1b[22m', '\x1b[22m\x1b[2m') +
        '\x1b[22m';
      for (const word of words) {
        expect(dimBefore(active, word), word + ' active').toBe(false);
        expect(dimBefore(inactive, word), word + ' inactive').toBe(true);
      }
    }
  });
  it('never accepts terminal controls or multiline content from imported captions or previews', () => {
    const formatted = layoutChoices(
      [
        {
          value: 'safe',
          label: 'ignored',
          caption: 'ACME\x1b[2J\nname',
          preview: 'x\x1b[31my\nsecond',
        },
      ],
      { columns: 100, rows: 24, color: false },
    );
    expect(formatted[0]!.label).not.toContain('\x1b');
    expect(formatted[0]!.label).not.toContain('\n');
  });
  it('supports explicit color opt-out and does not put ANSI into no-color output', () => {
    vi.stubEnv('NO_COLOR', '');
    expect(terminalColors()).toBe(false);
    expect(
      layoutChoices(choices, { columns: 120, rows: 45, color: false }).every(
        (choice) => !choice.label.includes('\x1b'),
      ),
    ).toBe(true);
    const message = 'Quote editor\nNet: 1 · Total (Gesamtbetrag): 1 EUR\nHelp';
    expect(layoutMessage(message, false)).toBe(message);
  });
  it('emphasizes the total and title, not every line of help text', () => {
    const message = layoutMessage(
      'Quote editor\nNet: 1 · Total (Gesamtbetrag): 1 EUR\nHelp',
      true,
    );
    expect(message).toContain('\x1b[1;36mQuote editor');
    expect(message).toContain('\x1b[1;32mTotal (Gesamtbetrag): 1 EUR');
    expect(message).toContain('\x1b[90mHelp');
  });
  it('keeps captions concise while retaining German accounting terms', () => {
    expect(compactLabel('date', 'fallback')).toBe('Date (Datum)');
    expect(compactLabel('contactPersonId', 'fallback')).toBe(
      'Contact (Ansprechpartner)',
    );
    expect(compactLabel('unknown', 'Fallback')).toBe('Fallback');
  });
});
