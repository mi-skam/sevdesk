import { defineLayoutCommand } from '../../layout-command';

export default defineLayoutCommand({
  label: 'credit note',
  change: (client, creditNoteId, change) =>
    client.creditNotes.changeParameter({ creditNoteId, ...change }),
});
