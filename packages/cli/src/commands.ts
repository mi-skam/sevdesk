import accountingContactsCreate from './commands/accounting-contacts/create';
import accountingContactsDelete from './commands/accounting-contacts/delete';
import accountingContactsGet from './commands/accounting-contacts/get';
import accountingContactsList from './commands/accounting-contacts/list';
import accountingContactsUpdate from './commands/accounting-contacts/update';
import accountsDatevGet from './commands/accounts-datev/get';
import accountsDatevList from './commands/accounts-datev/list';
import accountsBalance from './commands/accounts/balance';
import accountsCreateClearing from './commands/accounts/create-clearing';
import accountsCreateFileImport from './commands/accounts/create-file-import';
import accountsGet from './commands/accounts/get';
import accountsList from './commands/accounts/list';
import contactFieldSettingsCreate from './commands/contact-field-settings/create';
import contactFieldSettingsDelete from './commands/contact-field-settings/delete';
import contactFieldSettingsGet from './commands/contact-field-settings/get';
import contactFieldSettingsList from './commands/contact-field-settings/list';
import contactFieldSettingsUpdate from './commands/contact-field-settings/update';
import contactFieldSettingsUsage from './commands/contact-field-settings/usage';
import contactFieldsCreate from './commands/contact-fields/create';
import contactFieldsDelete from './commands/contact-fields/delete';
import contactFieldsGet from './commands/contact-fields/get';
import contactFieldsList from './commands/contact-fields/list';
import contactFieldsUpdate from './commands/contact-fields/update';
import contactsAddAddress from './commands/contacts/add-address';
import contactsAddEmail from './commands/contacts/add-email';
import contactsAddPhone from './commands/contacts/add-phone';
import contactsCreate from './commands/contacts/create';
import contactsDelete from './commands/contacts/delete';
import contactsDeleteAddress from './commands/contacts/delete-address';
import contactsGet from './commands/contacts/get';
import contactsList from './commands/contacts/list';
import contactsUpdate from './commands/contacts/update';
import contactsUpdateAddress from './commands/contacts/update-address';
import creditNotesGet from './commands/credit-notes/get';
import creditNotesLayout from './commands/credit-notes/layout';
import creditNotesList from './commands/credit-notes/list';
import creditNotesPdf from './commands/credit-notes/pdf';
import creditNotesPrint from './commands/credit-notes/print';
import dbHistory from './commands/db/history';
import dbInfo from './commands/db/info';
import dbSync from './commands/db/sync';
import doctor from './commands/doctor';
import exportContacts from './commands/export/contacts';
import exportDatev from './commands/export/datev';
import exportInvoices from './commands/export/invoices';
import exportTransactions from './commands/export/transactions';
import exportVouchers from './commands/export/vouchers';
import guidanceAccounts from './commands/guidance/accounts';
import invoicesCreate from './commands/invoices/create';
import invoicesDelete from './commands/invoices/delete';
import invoicesGet from './commands/invoices/get';
import invoicesLayout from './commands/invoices/layout';
import invoicesList from './commands/invoices/list';
import invoicesPdf from './commands/invoices/pdf';
import invoicesSend from './commands/invoices/send';
import invoicesUpdate from './commands/invoices/update';
import layoutsLetterpapers from './commands/layouts/letterpapers';
import layoutsTemplates from './commands/layouts/templates';
import login from './commands/login';
import logout from './commands/logout';
import numberingGet from './commands/numbering/get';
import ordersGet from './commands/orders/get';
import ordersLayout from './commands/orders/layout';
import ordersList from './commands/orders/list';
import ordersPdf from './commands/orders/pdf';
import partsGet from './commands/parts/get';
import partsList from './commands/parts/list';
import placeholdersList from './commands/placeholders/list';
import privateTransactionRulesCreate from './commands/private-transaction-rules/create';
import privateTransactionRulesDelete from './commands/private-transaction-rules/delete';
import privateTransactionRulesList from './commands/private-transaction-rules/list';
import quotesCreate from './commands/quotes/create';
import quotesGet from './commands/quotes/get';
import quotesList from './commands/quotes/list';
import quotesPdf from './commands/quotes/pdf';
import quotesSend from './commands/quotes/send';
import tagsCreate from './commands/tags/create';
import tagsDelete from './commands/tags/delete';
import tagsList from './commands/tags/list';
import transactionsCreate from './commands/transactions/create';
import transactionsGet from './commands/transactions/get';
import transactionsList from './commands/transactions/list';
import vouchersBook from './commands/vouchers/book';
import vouchersCreate from './commands/vouchers/create';
import vouchersDocument from './commands/vouchers/document';
import vouchersEnshrine from './commands/vouchers/enshrine';
import vouchersGet from './commands/vouchers/get';
import vouchersList from './commands/vouchers/list';
import vouchersOpen from './commands/vouchers/open';
import vouchersPositions from './commands/vouchers/positions';
import vouchersResetToDraft from './commands/vouchers/reset-to-draft';
import vouchersResetToOpen from './commands/vouchers/reset-to-open';
import vouchersUpdate from './commands/vouchers/update';

/** Every CLI command, keyed `group:action`. The MCP server derives its tools from it. */
export const commands = {
  login,
  logout,
  doctor,
  'db:history': dbHistory,
  'db:info': dbInfo,
  'db:sync': dbSync,
  'accounting-contacts:create': accountingContactsCreate,
  'accounting-contacts:delete': accountingContactsDelete,
  'accounting-contacts:get': accountingContactsGet,
  'accounting-contacts:list': accountingContactsList,
  'accounting-contacts:update': accountingContactsUpdate,
  'accounts-datev:get': accountsDatevGet,
  'accounts-datev:list': accountsDatevList,
  'accounts:balance': accountsBalance,
  'accounts:create-clearing': accountsCreateClearing,
  'accounts:create-file-import': accountsCreateFileImport,
  'accounts:get': accountsGet,
  'accounts:list': accountsList,
  'contact-field-settings:create': contactFieldSettingsCreate,
  'contact-field-settings:delete': contactFieldSettingsDelete,
  'contact-field-settings:get': contactFieldSettingsGet,
  'contact-field-settings:list': contactFieldSettingsList,
  'contact-field-settings:update': contactFieldSettingsUpdate,
  'contact-field-settings:usage': contactFieldSettingsUsage,
  'contact-fields:create': contactFieldsCreate,
  'contact-fields:delete': contactFieldsDelete,
  'contact-fields:get': contactFieldsGet,
  'contact-fields:list': contactFieldsList,
  'contact-fields:update': contactFieldsUpdate,
  'contacts:add-address': contactsAddAddress,
  'contacts:add-email': contactsAddEmail,
  'contacts:add-phone': contactsAddPhone,
  'contacts:create': contactsCreate,
  'contacts:delete': contactsDelete,
  'contacts:delete-address': contactsDeleteAddress,
  'contacts:get': contactsGet,
  'contacts:list': contactsList,
  'contacts:update': contactsUpdate,
  'contacts:update-address': contactsUpdateAddress,
  'credit-notes:get': creditNotesGet,
  'credit-notes:list': creditNotesList,
  'credit-notes:layout': creditNotesLayout,
  'credit-notes:pdf': creditNotesPdf,
  'credit-notes:print': creditNotesPrint,
  'export:contacts': exportContacts,
  'export:datev': exportDatev,
  'export:invoices': exportInvoices,
  'export:transactions': exportTransactions,
  'export:vouchers': exportVouchers,
  'guidance:accounts': guidanceAccounts,
  'invoices:create': invoicesCreate,
  'invoices:delete': invoicesDelete,
  'invoices:send': invoicesSend,
  'invoices:update': invoicesUpdate,
  'invoices:get': invoicesGet,
  'invoices:layout': invoicesLayout,
  'invoices:list': invoicesList,
  'invoices:pdf': invoicesPdf,
  'layouts:letterpapers': layoutsLetterpapers,
  'layouts:templates': layoutsTemplates,
  'numbering:get': numberingGet,
  'orders:get': ordersGet,
  'orders:layout': ordersLayout,
  'orders:list': ordersList,
  'orders:pdf': ordersPdf,
  'parts:get': partsGet,
  'parts:list': partsList,
  'placeholders:list': placeholdersList,
  'private-transaction-rules:create': privateTransactionRulesCreate,
  'private-transaction-rules:delete': privateTransactionRulesDelete,
  'private-transaction-rules:list': privateTransactionRulesList,
  'quotes:create': quotesCreate,
  'quotes:get': quotesGet,
  'quotes:list': quotesList,
  'quotes:pdf': quotesPdf,
  'quotes:send': quotesSend,
  'tags:create': tagsCreate,
  'tags:delete': tagsDelete,
  'tags:list': tagsList,
  'transactions:create': transactionsCreate,
  'transactions:get': transactionsGet,
  'transactions:list': transactionsList,
  'vouchers:book': vouchersBook,
  'vouchers:create': vouchersCreate,
  'vouchers:document': vouchersDocument,
  'vouchers:enshrine': vouchersEnshrine,
  'vouchers:get': vouchersGet,
  'vouchers:list': vouchersList,
  'vouchers:open': vouchersOpen,
  'vouchers:positions': vouchersPositions,
  'vouchers:reset-to-draft': vouchersResetToDraft,
  'vouchers:reset-to-open': vouchersResetToOpen,
  'vouchers:update': vouchersUpdate,
};
