// Imported only by the terminal integration tests. All contacts and documents are invented.
// No real HTTP requests or credential reads are possible in these journeys.
import { consola } from 'consola';
import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
const log = (event) =>
  appendFileSync(process.env.QUOTE_TEST_LOG, JSON.stringify(event) + '\n', {
    mode: 0o600,
  });
const originalPrompt = consola.prompt.bind(consola);
consola.prompt = async (message, options) => {
  log({ event: 'prompt', message, ...options });
  const value = await originalPrompt(message, options);
  log({
    event: 'answer',
    message,
    value: typeof value === 'symbol' ? 'CANCELLED' : value,
  });
  return value;
};
const contacts = [
  {
    id: '7',
    name: 'Alpha Example',
    customerNumber: 'C-1',
    status: '1000',
    category: { id: '3' },
  },
  {
    id: '8',
    name: 'Beta Example',
    customerNumber: 'C-2',
    status: '1000',
    category: { id: '3' },
  },
  {
    id: '9',
    name: 'Inactive Example',
    customerNumber: 'C-3',
    status: '100',
    category: { id: '3' },
  },
  {
    id: '10',
    name: null,
    surename: 'Alex',
    familyname: 'Example',
    customerNumber: 'C-1',
    status: '1000',
    category: { id: '3' },
    parent: { id: '7' },
  },
];
const addresses = [7, 8].map((id) => ({
  id: String(id + 100),
  contact: { id: String(id) },
  street: 'Example Street 1',
  zip: '12345',
  city: 'Example City',
  country: { id: '1' },
}));
let saved;
let occupied;
const json = (objects) =>
  new globalThis.Response(JSON.stringify({ objects }), {
    headers: { 'Content-Type': 'application/json' },
  });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const body = init.body ? JSON.parse(init.body) : undefined;
  log({
    event: 'request',
    method: init.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body,
  });
  if (url.origin !== 'https://my.sevdesk.de')
    throw Error('Unexpected host; real network is disabled.');
  const path = url.pathname.replace('/api/v1', '');
  const page = (rows) =>
    json(Number(url.searchParams.get('offset') || '0') === 0 ? rows : []);
  if (path === '/Contact')
    return page(
      contacts.filter(
        (v) =>
          !url.searchParams.get('customerNumber') ||
          v.customerNumber === url.searchParams.get('customerNumber'),
      ),
    );
  if (/^\/Contact\/\d+$/.test(path))
    return json(contacts.filter((v) => v.id === path.split('/').at(-1)));
  if (path === '/ContactAddress') return page(addresses);
  if (path === '/CommunicationWay') {
    const id = url.searchParams.get('contact[id]');
    return page([
      {
        id: '31',
        contact: { id },
        type: 'EMAIL',
        value: id === '8' ? 'beta@example.com' : 'alpha@example.com',
      },
    ]);
  }
  if (path === '/Part')
    return page([
      {
        id: '12',
        name: 'Example catalogue service',
        partNumber: 'P-1',
        text: 'Example description',
        unity: { id: '1' },
        priceNet: '100',
        priceGross: '119',
        taxRate: '19',
      },
    ]);
  if (path === '/SevSequence/Factory/getByType')
    return json({
      id: '21',
      forObject: 'Order',
      type: 'AN',
      format: 'AN-%NUMBER',
      nextSequence: '2',
    });
  if (path === '/Order') {
    if (
      process.env.QUOTE_TEST_FAILURE === 'number-collision' &&
      url.searchParams.get('orderNumber') === 'AN-2'
    )
      occupied = {
        id: '43',
        orderNumber: 'AN-2',
        orderType: 'AN',
        status: '100',
      };
    return page([...(saved ? [saved] : []), ...(occupied ? [occupied] : [])]);
  }
  if (path === '/Order/Factory/saveOrder') {
    saved = {
      ...body.order,
      id: '42',
      status: '100',
      orderType: 'AN',
      orderNumber: body.order.orderNumber,
      sumNet: '200',
      sumTax: '38',
      sumGross: '238',
      sendDate: null,
    };
    return json({ order: saved, orderPos: body.orderPosSave });
  }
  if (path === '/Order/42') return json(saved ? [saved] : []);
  if (path === '/Order/42/sendViaEmail') {
    if (process.env.QUOTE_TEST_FAILURE === 'send')
      throw new Error('Simulated send timeout');
    saved.status = '200';
    saved.sendDate = '2024-03-01';
    return json([{ id: '51', to: body.toEmail }]);
  }
  throw Error('Unmocked endpoint; real network is disabled: ' + path);
};
