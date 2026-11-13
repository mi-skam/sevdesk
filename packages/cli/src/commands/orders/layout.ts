import { defineLayoutCommand } from '../../layout-command';

export default defineLayoutCommand({
  label: 'order',
  change: (client, orderId, change) =>
    client.orders.changeParameter({ orderId, ...change }),
});
