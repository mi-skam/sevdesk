import { z } from 'zod';
import { formatError } from '../errors';

/** Human labels only. Machine-readable validation deliberately retains JSON paths. */
const labels: Record<string, string> = {
  customer: 'Customer (Kunde)',
  recipient: 'Recipient address (Empfängeradresse)',
  'recipient.address': 'Recipient address (Empfängeradresse)',
  'recipient.countryId': 'Recipient country (Empfängerland)',
  document: 'Quote details (Angebotsdaten)',
  'document.number': 'Quote number (Angebotsnummer)',
  'document.date': 'Quote date (Angebotsdatum)',
  'document.validUntil': 'Valid until (Gültig bis)',
  'document.heading': 'Subject (Betreff)',
  'document.currency': 'Currency (Währung)',
  'document.priceMode': 'Net/gross pricing (Netto-/Bruttopreise)',
  'document.contactPersonId': 'Our contact person (Unser Ansprechpartner)',
  'document.customerReference': 'Customer reference (Kundenreferenz)',
  'document.smallSettlement':
    'Small entrepreneur scheme (Kleinunternehmerregelung)',
  tax: 'Tax treatment (Steuerbehandlung)',
  'tax.ruleId': 'Tax rule (Steuerregel)',
  'tax.text': 'Tax text (Steuertext)',
  positions: 'Line items (Positionen)',
  'texts.introduction': 'Introduction (Einleitung)',
  'texts.closing': 'Closing text (Schlusstext)',
  'terms.payment': 'Payment terms (Zahlungsbedingungen)',
  'terms.delivery': 'Delivery terms (Lieferbedingungen)',
  delivery: 'Sending (Versand)',
  'delivery.to': 'Recipient (Empfänger)',
  'delivery.cc': 'Copy recipients (Kopieempfänger)',
  'delivery.bcc': 'Blind copy recipients (Blindkopieempfänger)',
  'delivery.subject': 'Email subject (E-Mail-Betreff)',
  'delivery.message': 'Email message (E-Mail-Nachricht)',
  'delivery.copyToSelf': 'Copy to self (Kopie an mich)',
};
const positionLabels: Record<string, string> = {
  name: 'Name (Bezeichnung)',
  description: 'Description (Beschreibung)',
  quantity: 'Quantity (Menge)',
  unit: 'Unit (Einheit)',
  'unit.id': 'Unit (Einheit)',
  'unit.label': 'Unit (Einheit)',
  unitPrice: 'Unit price (Einzelpreis)',
  vatRate: 'VAT rate (Umsatzsteuersatz)',
  discount: 'Discount (Rabatt)',
  optional: 'Optional item (Optionale Position)',
};

function reason(issue: z.core.$ZodIssue): string {
  if (issue.message.startsWith('Required before saving'))
    return 'Please complete before saving (Bitte vor dem Speichern ergänzen).';
  if (issue.code === 'invalid_type') {
    if (issue.expected === 'int')
      return 'Enter a whole number (Ganze Zahl eingeben).';
    if (issue.expected === 'number')
      return 'Enter a valid number (Gültige Zahl eingeben).';
    return 'Please fill in this field (Bitte dieses Feld ausfüllen).';
  }
  if (issue.code === 'invalid_format') {
    if (issue.format === 'date')
      return 'Enter a valid date as YYYY-MM-DD (Gültiges Datum als JJJJ-MM-TT eingeben).';
    if (issue.format === 'email')
      return 'Enter a valid email address (Gültige E-Mail-Adresse eingeben).';
    if (issue.format === 'regex')
      return 'Use a non-negative decimal with a dot and up to four decimal places (Nicht negative Dezimalzahl mit Punkt und höchstens vier Nachkommastellen eingeben).';
  }
  if (issue.code === 'too_small' && issue.origin === 'string')
    return 'Please enter a value (Bitte einen Wert eingeben).';
  if (issue.code === 'too_small' && issue.origin === 'number')
    return 'Enter a positive number (Positive Zahl eingeben).';
  if (issue.code === 'invalid_value')
    return 'Choose one of the offered values (Einen der angebotenen Werte wählen).';
  if (issue.code === 'invalid_union')
    return 'Choose a customer (Einen Kunden wählen).';
  if (issue.code === 'unrecognized_keys')
    return 'Contains unsupported information (Enthält nicht unterstützte Angaben).';
  return issue.message;
}

export function quoteError(
  error: unknown,
  fieldLabels: Record<string, string> = {},
): string {
  if (!(error instanceof z.ZodError)) return formatError(error);
  return error.issues
    .map((issue) => {
      const path = issue.path.map(String).join('.');
      let label = fieldLabels[path] ?? labels[path];
      if (
        !label &&
        issue.path[0] === 'positions' &&
        typeof issue.path[1] === 'number'
      ) {
        const field = positionLabels[issue.path.slice(2).map(String).join('.')];
        label = `Line item ${issue.path[1] + 1} (Position ${issue.path[1] + 1})${field ? ` · ${field}` : ''}`;
      }
      for (let length = issue.path.length - 1; !label && length > 0; length--) {
        const parent = issue.path.slice(0, length).map(String).join('.');
        const parentLabel = fieldLabels[parent] ?? labels[parent];
        if (parentLabel)
          label =
            parentLabel +
            (typeof issue.path[length] === 'number'
              ? ` ${Number(issue.path[length]) + 1}`
              : '');
      }
      // Unexpected schema paths must not leak implementation names into the dialogue.
      return `${label ?? 'Quote (Angebot)'}: ${reason(issue)}`;
    })
    .join('\n');
}
