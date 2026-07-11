# Changelog

All notable changes to this project will be documented in this file.

## 1.0.0 — 2026-07-11

### Changed

- **Migrated to the DHIS2 App Platform.** The app is now a React +
  TypeScript application built with `@dhis2/cli-app-scripts`, using
  `@dhis2/app-runtime` for data access and `@dhis2/ui` for all UI
  components. The custom webpack setup, `materialize-css`, `choices.js`,
  the hand-rolled `d2api.js` fetch layer and the legacy header-bar
  loader are all gone; the platform shell now provides the header bar,
  login handling and manifest generation.
- Program lists and results tables use `@dhis2/ui` components
  (`MultiSelectField`, `DataTable`, `TabBar`, `Modal`, `NoticeBox`,
  `LinearLoader`), so the app follows the DHIS2 design system.
- All user-facing strings go through `@dhis2/d2-i18n` and are
  extractable for translation.
- Validation logic (expression validation via the description
  endpoints, unused-variable detection incl. `d2:hasValue` and
  string-literal stripping, concurrency limits, cancellation) is ported
  unchanged and now covered by unit tests (`pnpm test`).
- Result tabs show counts, the unused-variables filter only offers
  validated programs, and selections are pruned when the filter
  changes.
- CI workflow builds with pnpm + `d2-app-scripts` and attaches
  `build/bundle/tool-pr-validator-<version>.zip` to releases.
- `minDHIS2Version` is 2.40.

### Removed

- `webpack.config.js`, `d2auth.json` handling, `manifest.webapp`
  generation via `d2-manifest`, `src/js/*`, Materialize CSS/JS and the
  bundled legacy DHIS2 header bar.
- The Python Playwright scripts under `tests/playwright/` (written for
  the old DOM); functional testing is now done against the platform UI.

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
