import { quoteDraftSchema } from '../src/quotes/model';

export function quoteFixture() {
  return quoteDraftSchema.parse({
    schemaVersion: 1,
    customer: { number: 'C-TEST' },
    document: {
      number: 'AN-TEST',
      date: '2024-02-29',
      validUntil: '2024-03-31',
      heading: 'Example offer',
      currency: 'EUR',
      priceMode: 'net',
      contactPersonId: 8,
    },
    tax: { ruleId: 1, text: 'Umsatzsteuer 19%' },
    positions: [
      {
        name: 'Consulting',
        quantity: '2',
        unit: { id: 1, label: 'hours' },
        unitPrice: '100.00',
        vatRate: '19',
      },
    ],
    texts: { introduction: 'Hello <script> & goodbye', closing: 'Thank you' },
    terms: { payment: '14 days', delivery: 'By arrangement' },
    delivery: {
      to: 'customer@example.com',
      subject: 'Angebot {{number}}',
      message: 'Attached: {{number}}',
      cc: ['copy@example.com'],
      copyToSelf: true,
    },
  });
}
