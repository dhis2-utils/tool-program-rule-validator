# Review findings: Program Rule Validator (App Platform migration)

Reviewed: 2026-07-11 · Scope: full review — static code review, functional/UI testing, multi-version compatibility, architecture & UX assessment · Reviewer: agent (Claude, Opus 4.8)
DHIS2 versions tested: 2.40.12 (SL), 2.41.9 (Laos), 2.42.x (SL), 2.43.x (SL)

## Summary

The migration from the vanilla-JS webpack/materialize/choices.js tool to the React DHIS2 App Platform (`@dhis2/cli-app-scripts`, `@dhis2/app-runtime`, `@dhis2/ui`, TanStack Query v4) is faithful and high quality. The domain logic — unused-variable detection, `d2:hasValue` handling, string-literal stripping, concurrency limits (`pLimit` 4 programs / 10 rules), abort/cancel — is a near-exact, unit-tested port of the original. Every functional flow passed on all four DHIS2 versions and against both the Sierra Leone and Laos databases, with clean console/network hygiene and correct behaviour inside the 2.42+ global-shell iframe. **No HIGH (correctness/data-loss/blocking) findings.** The findings below are two MEDIUM robustness issues (both largely inherited from the original tool) and a handful of LOW polish items. The app is safe to release as-is; the MEDIUM items are worth addressing before wider use.

Lint, `tsc`, unit tests (`pnpm test`, 11 passing) and the production build all pass.

## Findings

### HIGH

None.

### MEDIUM

#### M1. Transient/server errors are reported as "invalid expression" rows (false positives)

- **Where**: `src/lib/expressionDescription.ts:44-64`, consumed in `src/hooks/useValidation.ts:93-99,111-119`
- **What**: In `describeExpression`, a network failure or any non-OK HTTP status (500, 429 rate-limit, gateway error) resolves to `fallbackErrorMessage`, which is then rendered in the Invalid Conditions / Invalid Actions tab identically to a genuine validation error. During a large "Validate all" run — which fires many concurrent POSTs (peak ~14 in flight) — a single transient 500 or timeout will mark a *valid* rule as invalid with the generic text "Condition validation error" / "Action expression validation error", with no way for the user to tell it apart from a real problem. This behaviour is inherited from the original `app.js` (a preserved quirk, not a new regression), but it is a real correctness/UX weakness. Note: the expected DHIS2 `409` for an invalid action expression carries a `status:ERROR` JSON body and is correctly classified as a real error — this finding is specifically about *transport*/5xx failures that carry no such body.
- **Fix**: Distinguish transport/5xx failures (no parseable `status:ERROR` body) from genuine validation `ERROR` responses. Surface the former as a run-level warning (e.g. an AlertBar "N expressions could not be validated — server error") and/or retry them, and only render a results row for a true validation error.

#### M2. Custom description-endpoint fetch omits headers the data engine always sends

- **Where**: `src/lib/expressionDescription.ts:44-52`
- **What**: The expression-description POSTs use a hand-rolled `fetch` (because `@dhis2/app-runtime` only sends `text/plain` for a fixed allow-list of resources that excludes these endpoints). That fetch sends `Content-Type: text/plain` and `credentials: 'include'` (both correct) but omits `X-Requested-With: XMLHttpRequest` and `Accept: application/json`, which the engine's `RestAPILink`/`fetchData` sends on **every** request (verified in `@dhis2/app-service-data`). If the session expires mid-run, a `401` without `X-Requested-With` can trigger the browser's native basic-auth dialog, and some DHIS2 security configurations key authorization behaviour off that header. Practical impact is limited to the session-expiry edge case, but the inconsistency is easy to remove.
- **Fix**: Add `'X-Requested-With': 'XMLHttpRequest'` and `'Accept': 'application/json'` to the request headers so these POSTs behave like every other call the app makes.

### LOW

#### L1. Validation results are discarded when a subsequent run is cancelled or errors — `src/hooks/useValidation.ts` (`start`/`cancel`)
If the user has results displayed and then starts another run that they cancel (or that errors), the state transitions to `cancelled`/`error` and the previously displayed results disappear, forcing a full re-run. Consider preserving the last `done` results on cancel/error.

#### L2. Selection checkboxes lack accessible labels — `src/components/UnusedVariablesTab.tsx:161-170,194-206`
The select-all and per-row `Checkbox`es have no `aria-label`, so screen-reader users hear an unlabelled checkbox. Add `aria-label` (e.g. "Select all unused variables" / the variable name). The "Open in Maintenance" button (`InvalidExpressionsTable.tsx`) also opens a new tab with no visual affordance that it will.

#### L3. Custom fetch ignores a configured `apiVersion` — `src/lib/expressionDescription.ts:16-23`
`apiUrl` hardcodes `/api/<path>`, while engine queries would use `/api/<apiVersion>/<path>` if `apiVersion` were set. `d2.config.js` sets no `apiVersion`, so this is latent only — but if one is added later, the description POSTs would silently target a different API version than the rest of the app. Derive the prefix from config for consistency.

#### L4. Cosmetic: program multi-select only shows a search box above 10 programs — `src/components/ValidatorPage.tsx` (`filterable={allPrograms.length > 10}`)
The original tool always enabled search. On instances with a handful of programs the search box is now hidden. Harmless; consider always enabling `filterable` for parity.

#### L5. Trivial: inaccurate comment in `apiUrl` — `src/lib/expressionDescription.ts:16-22`
The comment claims `joinPath` "collapses '//' after the scheme"; it does not (the `//` is never at a part boundary), making the subsequent `.replace(/^(https?:)\/+/,'$1//')` a harmless no-op. The code is correct; the comment is misleading. Trim the comment (and the dead `.replace`).

## Claims investigated and rejected

- **Claim**: The app renders no `<HeaderBar>`, so on DHIS2 2.40/2.41 (before the global shell) it shows with no DHIS2 header or navigation — reported MEDIUM by the static-review subagent (the original `app.js` called `loadLegacyHeaderBarIfNeeded()`, and `App.tsx`/`ValidatorPage.tsx` indeed render no header).
  - **Refuted by**: (1) Framework source — `@dhis2/app-adapter`'s `AppWrapper` (`build/cjs/components/AppWrapper.js`) unconditionally renders `<ConnectedHeaderBar>` → `@dhis2/ui` `HeaderBar` for every App Platform app, on all versions, independent of the global shell; the app-shell bundles it into the app's own build. (2) Live evidence — the 2.40 and 2.41 screenshots both show the DHIS2 header bar. Rendering a manual `<HeaderBar>` would produce a **double** header. The app is correct to omit its own.

- **Claim**: The invalid-condition message "1 error(s), 0 warning(s)" is unhelpful and possibly an app-side mangling of the server response.
  - **Refuted by**: Direct calls to `POST /api/programRules/condition/description` — DHIS2 itself returns `description: "1 error(s), 0 warning(s)"` for an unknown-variable reference (syntactic errors get detailed messages like "expected name at line:1 …"). The app faithfully surfaces the server's `description`, matching the original tool. This is a server-side message-quality limitation, not an app defect.

## Architecture assessment

**Recommendation: stay on the App Platform (the migration was the right move).** This tool has outgrown the vanilla tool-template shape: it needs the DHIS2 look-and-feel, i18n, and robust auth/version handling, and its core weakness in the original — a hand-rolled `fetch` wrapper (`d2api.js`) with bespoke error handling — is exactly what `@dhis2/app-runtime` removes. The migration deletes that layer for all reads/mutations (only the two `text/plain` description endpoints still need a manual fetch, because the runtime's allow-list excludes them — see M1/M2, the residual risk). Benefits realised: native `@dhis2/ui` components, extractable translations, automatic header bar / global-shell integration across 2.40–2.43, and a unit-tested pure-logic core. Cost was a full rewrite of the UI layer (~9 components/hooks, done) with the logic ported 1:1; the e2e suite in `tests/e2e/` doubles as the acceptance suite and passes on all four versions. No reason to revert.

## Environment gaps

- **2.43 seed** was the newest available (`dhis2-db-sierra-leone_v43.sql.gz`); no Laos v42/v43 seed exists, so 2.42 and 2.43 were exercised on the Sierra Leone database only. Both databases are covered across the version matrix (Laos on 2.41; Sierra Leone on 2.40/2.42/2.43), satisfying "test in both databases, at least one test per version 2.40–2.43".
- Testing ran over plain HTTP inside the sandbox (hence the benign secure-context/PWA console warnings); production is served over HTTPS.
