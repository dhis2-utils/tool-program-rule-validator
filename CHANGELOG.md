# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0]

### Upgrading

- Requires DHIS2 2.41 or later.
- If you installed 1.0.0 or earlier, which used the app key `tool-pr-validator`:
  install this version, then uninstall the old **Program Rule Validator Tool** app
  in the App Management app, or two entries remain in the app menu.
- Add the new app to every user role that gave access to the old one. Until then,
  users without the ALL authority cannot open it. The release notes of 1.0.1 left
  this step out.
- Bookmarks to the old app URL stop working.

### Added

- The delete confirmation lists the variables, and offers a backup: the
  selected variables as a metadata file that the Import/Export app can import.
- Before deleting, the tool reads the program's rules again, and does not
  delete a variable that a rule uses now.
- User documentation in `docs/user/`, for docs.dhis2.org. It replaces `MANUAL.md`.
- The end-to-end suite follows the `e2e/run.sh` contract of
  reference-tool-conventions, and checks every way a rule can reference a
  variable.

### Changed

- Deleting is only possible from the results of the last run, not from earlier
  results kept on screen after a cancelled or failed run.
- A failed delete shows the server's reason, such as a missing authority.
- The **Edit** control is a link, so it can be opened from the context menu.
- **Edit** opens Metadata Management only when its version has an edit
  screen for the object (program rule variables from 0.119.0, program rules
  from 0.135.0), and Maintenance otherwise. It also recognises Metadata
  Management installed under its earlier key, `maintenance-preview`. The
  tooltip names the app as the app menu shows it.
- A filter and ticked rows survive switching tabs.
- The app shows "HISP Centre - University of Oslo" as its author, and uses the
  shared 96 x 96 tool icon.
- Updated `@dhis2/ui`, `@dhis2/app-runtime` and `@dhis2/cli-app-scripts`;
  TypeScript `strict` is on.
- CI and release workflows match the reference-tool-conventions templates.

### Removed

- `react-router-dom`: the app has one page.
- Working notes and earlier review logs under `review/` and `docs/`.

### Fixed

- Variables referenced by quoted name in `d2:count`, `d2:countIfValue`,
  `d2:countIfZeroPos`, `d2:maxValue`, `d2:minValue` or `d2:lastEventDate`,
  or inside the string argument of `d2:condition`, were listed as unused
  and offered for deletion. On a large demo database, more than half of
  the listed variables were in use.
- DHIS2 error responses (401, 400, 403, 500) were listed as invalid
  expressions, because their body also says `"status": "ERROR"`. The
  1.0.0 fix for this covered only error pages without a JSON body.
  Only HTTP 200 and 409 now count as a verdict.
- An expired session stops the run with a message, instead of listing
  every remaining rule as invalid.
- After a delete, a warning or error replaced the success message.
  Both now show in one message.
- Clicking **Delete** twice sent the same delete twice.
- Variable names with `&` or `<` were escaped twice in checkbox labels.

## [1.0.1] - 2026-09-30

### Upgrading

- The app key is now `tool-program-rule-validator`, matching the repository name.
  Earlier versions, including 1.0.0, were installed under `tool-pr-validator`, so DHIS2
  treats 1.0.1 as a new app: after installing it, **uninstall the old "Program Rule
  Validator Tool" app** in the App Management app, or two entries remain in the app
  menu. Bookmarks to the old app URL stop working.

## [1.0.0] - 2026-08-28

### Added

- Results rows link to the **Metadata Management** app when it is
  installed and the user may open it, falling back to Maintenance
  otherwise. Metadata Management is installable from the App Hub on
  2.41 and 2.42, and bundled from 2.43, so which app to use is resolved
  at runtime from `apps/menu`, which lists only apps the user may open
  and reports each app's launch URL. When the user has neither app the
  link is omitted rather than offering a dead end.
- Unused program rule variables link out for editing too; previously
  only invalid expressions did. The link button is labelled "Edit", with
  the app it opens named in its tooltip.

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

### Fixed

- Transient server failures are no longer reported as invalid expressions.
  A 5xx, a rate-limit response or a dropped connection used to produce a
  generic "Condition validation error" row, indistinguishable from a real
  problem with the rule. Such requests are now retried with a short
  backoff, and anything still unanswered is counted and surfaced as a
  run-level warning instead of being listed as invalid.
- The expression-description requests now send the `X-Requested-With` and
  `Accept` headers that the data engine sends on every other request, so
  an expired session can no longer trigger the browser's native
  basic-auth dialog.
- The expression-description requests now use the same API version as the
  rest of the app (the engine defaults it to the server's own version)
  rather than always hitting the unversioned `/api/` path.
- Results from the last completed run stay on screen when a subsequent
  run is cancelled or fails, instead of being discarded.
- Selection checkboxes in the unused-variables table have accessible
  names, and the link-out button shows that it opens a new tab.
- The program pickers always offer a search box, matching the original
  tool, rather than only above ten programs.

## [0.2.0] - 2026-04-28

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
- `.DS_Store` and `__pycache__/` added to `.gitignore`.

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
