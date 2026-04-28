# Changelog

All notable changes to this project will be documented in this file.

## 0.2.0 — 2026-04-28

### Added
- Cancel button to interrupt an in-progress validation, with all in-flight
  fetches aborted via `AbortController` (signal threaded through every
  `d2*` helper).
- Materialize-styled delete-confirm modal in place of native `confirm()`.
- `tests/playwright/` directory with three Python scripts (`test_smoke`,
  `test_cancel`, `test_delete_modal`) and a README describing how to run
  them against a local DHIS2 + dev server.

### Changed
- Programs validated in parallel under `pLimit(4)`, with a single shared
  `pLimit(10)` capping rule-evaluation requests across the whole run.
  Validate All on a typical instance is meaningfully faster.
- Dev-server fetches now go through the webpack proxy (same-origin) so the
  app loads without needing `http://localhost:8081` in the DHIS2
  `corsWhitelist`. The proxy strips `Origin` / `Referer` headers so DHIS2
  treats the request as same-origin.
- Maintenance buttons in the invalid-condition / invalid-action tables
  now use Materialize classes for consistent styling.
- Legacy header-bar version check uses both major and minor parts and is
  NaN-safe.
- All `M.toast` calls go through a small `escapeHtml` helper.
- `setChoices` is called once per validation run instead of in a loop.

### Removed
- Unused `jquery` dependency and the corresponding `webpack.ProvidePlugin`.
- `window.validateProgramRules` and `window.deleteSelectedVariables`
  globals; the delete button is identified by id and wired via
  `addEventListener`.
- Unreachable `alert()` branch in `validateSelectedButton.onclick`.

### Fixed
- `validateUID` strips a query string before checking the UID format.
- `programRuleActions` iteration is guarded with `?? []`.
- `webpack.config.js` awaits the session-cookie fetch before exposing the
  config; `Set-Cookie` is parsed via `getSetCookie()` / `headers.raw()`
  instead of splitting on commas.
- Duplicated comment in `d2api.js`'s `formatEndpoint`.
- "Univeristy" typo in `package.json` (which `d2-manifest` reads when
  generating `manifest.webapp`).

### Repo hygiene
- `.DS_Store` and `__pycache__/` added to `.gitignore`.
