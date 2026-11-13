import { defineLayoutCommand } from '../../layout-command';

export default defineLayoutCommand({
  label: 'invoice',
  change: (client, invoiceId, change) =>
    client.invoices.changeParameter({ invoiceId, ...change }),
});
