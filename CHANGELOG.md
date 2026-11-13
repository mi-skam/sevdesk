# Changelog

## [0.4.4](https://github.com/mi-skam/sevdesk/compare/v0.4.3...v0.4.4) (2026-11-13)


### Features

* add a change log and db:history ([#33](https://github.com/mi-skam/sevdesk/issues/33)) ([6f41d13](https://github.com/mi-skam/sevdesk/commit/6f41d133e34a7086fdbde9d40c40eb104f052921))
* add an MCP server (sevdesk mcp) ([#35](https://github.com/mi-skam/sevdesk/issues/35)) ([c8475d9](https://github.com/mi-skam/sevdesk/commit/c8475d9b7c16a76b32e361e61361b9621514fdfc))
* add invoices:overdue and print a zero balance as 0 ([#37](https://github.com/mi-skam/sevdesk/issues/37)) ([862a076](https://github.com/mi-skam/sevdesk/commit/862a076d6f89995eaea09bd86d22663cb83b7833))


### Bug Fixes

* match invoice and order numbers ignoring case with --local ([#36](https://github.com/mi-skam/sevdesk/issues/36)) ([84302b8](https://github.com/mi-skam/sevdesk/commit/84302b8e390418d0d89f10e315b0e69d866eb47e))
* register invoices:overdue ([#38](https://github.com/mi-skam/sevdesk/issues/38)) ([955cf5a](https://github.com/mi-skam/sevdesk/commit/955cf5a94976f6de5337b39a1c6e899f08274ff7))

## [0.4.3](https://github.com/mi-skam/sevdesk/compare/v0.4.2...v0.4.3) (2026-11-13)


### Features

* show contact names in accounting contacts ([#32](https://github.com/mi-skam/sevdesk/issues/32)) ([e2da3c1](https://github.com/mi-skam/sevdesk/commit/e2da3c1e742abf66a4d1374212e4fdfc2aa7e3ea))


### Bug Fixes

* align table columns after wide characters ([#30](https://github.com/mi-skam/sevdesk/issues/30)) ([edb132f](https://github.com/mi-skam/sevdesk/commit/edb132ff5dc57fa3224f05c4a09347e2484dc546))

## [0.4.2](https://github.com/mi-skam/sevdesk/compare/v0.4.1...v0.4.2) (2026-11-13)


### Features

* add accounting contacts and private transaction rules ([#26](https://github.com/mi-skam/sevdesk/issues/26)) ([37255d1](https://github.com/mi-skam/sevdesk/commit/37255d1e957f869be678ddff6ea9744a0bf68c86))
* add contact custom fields and text placeholders ([#27](https://github.com/mi-skam/sevdesk/issues/27)) ([224a72c](https://github.com/mi-skam/sevdesk/commit/224a72c510bae65987fede8245aafd338b1e843e))
* add layouts, changeParameter and credit note print ([#28](https://github.com/mi-skam/sevdesk/issues/28)) ([0ef1be9](https://github.com/mi-skam/sevdesk/commit/0ef1be9b21b54884a905b4ef7580eb5bc9e98139))

## [0.4.1](https://github.com/mi-skam/sevdesk/compare/v0.4.0...v0.4.1) (2026-11-12)


### Bug Fixes

* send document-date filters as Unix seconds so dd.mm.yyyy works ([#22](https://github.com/mi-skam/sevdesk/issues/22)) ([b9f92b7](https://github.com/mi-skam/sevdesk/commit/b9f92b7ea8a4b08a6e2848e7b04d96290f231fc2))

## [0.4.0](https://github.com/mi-skam/sevdesk/compare/v0.3.2...v0.4.0) (2026-11-12)


### Features

* **cli:** read from the local database with --local ([#14](https://github.com/mi-skam/sevdesk/issues/14)) ([90768d3](https://github.com/mi-skam/sevdesk/commit/90768d33766744f273e0edb5fa1dbb5e0377071b))


### Bug Fixes

* **sdk:** type invoice render results as a full Base64 PDF ([#17](https://github.com/mi-skam/sevdesk/issues/17)) ([129529a](https://github.com/mi-skam/sevdesk/commit/129529a6247e3921fe3bca09b358ea6dbcba1f05))


### Documentation

* add an OpenAPI overlay with verified corrections to the sevdesk spec ([#20](https://github.com/mi-skam/sevdesk/issues/20)) ([9b927fa](https://github.com/mi-skam/sevdesk/commit/9b927fa1c85eb4e9130496728c81c13698f2970b))


### Miscellaneous Chores

* release 0.4.0 ([9f4daf1](https://github.com/mi-skam/sevdesk/commit/9f4daf1ea7f6ecad08424aa3257ed65bbc806b23))

## [0.3.2](https://github.com/mi-skam/sevdesk/compare/v0.3.1...v0.3.2) (2026-11-12)


### Miscellaneous Chores

* release 0.3.2 ([f8922a2](https://github.com/mi-skam/sevdesk/commit/f8922a28cedaf39c1d160b43045c6b071f7a66bf))

## [0.3.1](https://github.com/mi-skam/sevdesk/compare/v0.3.0...v0.3.1) (2026-11-12)


### Features

* change filters and local SQLite database (land [#6](https://github.com/mi-skam/sevdesk/issues/6) and [#7](https://github.com/mi-skam/sevdesk/issues/7) on main) ([#11](https://github.com/mi-skam/sevdesk/issues/11)) ([f84d51f](https://github.com/mi-skam/sevdesk/commit/f84d51f9b67fd4f1ab57c910530e243d411c3134))

## [0.3.0](https://github.com/mi-skam/sevdesk/compare/v0.2.0...v0.3.0) (2026-11-12)


### ⚠ BREAKING CHANGES

* the SDK is now imported from @mi-skam/sevdesk-sdk.

### Miscellaneous Chores

* rename packages to @mi-skam/sevdesk and release via one shared version ([23bd3e5](https://github.com/mi-skam/sevdesk/commit/23bd3e50efac8ba1b7823879b9371ff6432e6cdc))
