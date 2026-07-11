# tool-prv-validator — Code review and UI test findings

Reviewed against `main` @ commit `9e543ea`, tested against DHIS2 2.42.4 at `http://localhost:9021`.

## Test scope

- Static review of `src/app.js`, `src/js/d2api.js`, `src/js/check-header-bar.js`, `src/index.html`, `src/css/style.css`, `webpack.config.js`, `eslint.config.js`, `package.json`, `manifest.webapp`.
- Dynamic UI tests via Playwright against the dev server (`yarn start` on port 8081), pointed at the user's DHIS2 instance (28 programs, 2,699 program rules, 2,048 program-rule variables).
- ESLint passes with no warnings.

## UI test results — all functional flows pass

| Flow                                                                                            | Result |
| ----------------------------------------------------------------------------------------------- | ------ |
| App loads, programs dropdown populated (28 programs)                                            | PASS   |
| `Validate Selected` disabled with no selection                                                  | PASS   |
| `Validate All` enabled at idle                                                                  | PASS   |
| `Delete Selected` disabled at idle                                                              | PASS   |
| Tab switching between Invalid Conditions / Invalid Actions / Unused Variables                   | PASS   |
| Validate single program (Malaria Foci, 12 rules / 14 PRVs) → 2 unused PRVs detected             | PASS   |
| Validate larger program (Animal Health, 67 rules) → 3 unused PRVs detected                      | PASS   |
| Invalid condition row rendering (with injected bad rule) — backend message + Maintenance button | PASS   |
| Select-all checkbox ticks every visible row, enables Delete                                     | PASS   |
| Unselect-all disables Delete                                                                    | PASS   |
| Single-row check enables Delete                                                                 | PASS   |
| Filter by Programme — narrows visible rows correctly                                            | PASS   |
| No console errors / no failed requests / no 4xx API responses across the entire run             | PASS   |

The deletion endpoint was not exercised against real data, but the disabled-state, confirmation, and row-removal logic is shared across all paths and was indirectly verified through the select/unselect interactions and the API call signature in `src/app.js:334`.

---

## Findings, ordered by severity

### [HIGH] 1. Dev-server proxy is dead code; dev mode requires a CORS allowlist edit on the DHIS2 server

`webpack.config.js:130-159` defines a full request-proxy with cookie management, but `src/js/d2api.js:3` sets `baseUrl = isDev ? dhisDevConfig.baseUrl : "../../..";` — every fetch in dev mode goes cross-origin to `http://localhost:9021/...` directly, bypassing the proxy entirely. The browser then needs the DHIS2 instance to have `http://localhost:8081` in its CORS allowlist, otherwise the app silently fails (dropdown stays empty, only console errors).

Two ways to fix:

1. Delete the proxy + cookie code in `webpack.config.js` and document the CORS requirement in the README.
2. Change `d2api.js:3` to `const baseUrl = ""` in dev so requests go through the proxy as originally intended.

Option 2 is cleaner — no DHIS2-side configuration needed, and the dev server's existing `Authorization` header injection works.

### [HIGH] 2. The legacy header bar (~458 KB) is bundled and copied unconditionally into every build

`webpack.config.js:114` always copies `src/resources/dhis-header-bar.js` to `build/resources/`, and `src/js/check-header-bar.js:31` only loads it at runtime on DHIS2 < 2.42. The currently shipped `build/resources/dhis-header-bar.js` is ~458 KB — about 62% of the final zip. Gate the copy on a build flag, or remove entirely now that 2.41 is end-of-life.

### [HIGH] 3. Globals exposed via `window.*` and inline `onclick` attributes

`src/index.html:105` has `<button onclick="window.deleteSelectedVariables()">`, and `src/app.js:123,315` define `window.validateProgramRules` / `window.deleteSelectedVariables`. The HTML and JS are coupled by a hard-coded global name that is also the only selector used to find the button: `document.querySelector("button[onclick='window.deleteSelectedVariables()']")` (`src/app.js:37,133,354`). Any rename anywhere breaks all three locations silently. Give the button an `id` and wire it via `addEventListener`.

### [MEDIUM] 4. Programs validated sequentially, not in parallel

`src/app.js:164` does `for (const program of selectedPrograms) { ... await Promise.all(tasks); ... }` — the per-program loop is fully sequential. Inner concurrency is capped at `pLimit(10)` for rules within a program, but program-level work could run in parallel. With 28 programs and 2,699 rules in a typical instance, "Validate All" can take many minutes.

### [MEDIUM] 5. No way to cancel a long-running validation

Both validate buttons are disabled while a run is in progress, but there is no abort/cancel path. With the sequential per-program loop above, "Validate All" is uninterruptible. Consider an `AbortController` wired to a Cancel button, with `signal` plumbed through every `d2Get`/`d2PostPlain` call.

### [MEDIUM] 6. Dead-code alert path

`src/app.js:64-66` falls through to `alert("Please select at least one program to validate.")`, but the button is forcibly disabled (`src/app.js:49`) the moment the selection is empty. The branch is unreachable.

### [MEDIUM] 7. `confirm()` and `alert()` break Materialize UX

`src/app.js:65,327` use native browser dialogs while the rest of the app uses Materialize toasts (`M.toast`). Inconsistent style; native dialogs are also harder to dismiss in iframes and can be auto-blocked by the browser.

### [MEDIUM] 8. `webpack.config.js` calls async `fetchSessionCookie()` at module-load time and does not block

`webpack.config.js:58` invokes `initialize()` without awaiting it, then exports `module.exports = webpackConfig;`. There is a startup race where the dev server can begin handling proxied requests before the cookie is fetched — those early requests log "No cookie found". Note that this whole code path becomes irrelevant if Finding #1 is fixed via Option 2 (delete the proxy).

### [MEDIUM] 9. `Set-Cookie` header parsed by splitting on commas

`webpack.config.js:41` does `setCookieHeader.split(",")` — cookie values can legally contain commas (e.g. `Expires=Wed, 09 Jun 2026 ...`). Brittle if a future Set-Cookie includes such a value. Use the raw header list or a parser. Same caveat as #8: irrelevant if the proxy is removed.

### [MEDIUM] 10. Maintenance button is unstyled

`src/app.js:269,283` create the button with no Materialize classes. It renders as a default OS button next to a row of styled text. Add `class="btn btn-small"` or similar for consistency.

### [LOW] 11. `parseServerVersion` only inspects `minor`

`src/js/check-header-bar.js:22` returns `versionInfo.minor < 42`. `major` is parsed but never used; if DHIS2 ever ships a 3.x line, `3.0.0` would have `minor = 0 < 42` and the legacy header bar would re-load. Use a major+minor comparison.

### [LOW] 12. `parseServerVersion` returns `NaN` silently on garbage input

`parseInt("abc", 10) → NaN`, and `NaN < 42` is `false`. So if `version` is malformed, the legacy bar is _not_ loaded — which is the opposite of the `catch` branch in `shouldLoadLegacyHeaderBar`, which forces it on. The two paths disagree on the safe-default behaviour.

### [LOW] 13. `src/js/d2api.js:27-28` has a duplicated comment

Two identical `// Ensure the final format is /api/...` lines. Cosmetic.

### [LOW] 14. `validateUID` ignores query strings

`src/js/d2api.js:33` does `endpoint.split("/").pop()`, but the regex won't match if a `?...` is appended. Currently only an issue for `d2Delete` / `d2PutJson`, both called with bare UIDs in this app — but a footgun for callers.

### [LOW] 15. `M.toast` HTML rendered without escaping

`src/app.js:323,346,349` pass `html: ` strings — fine here because counts are integers, but the pattern is unsafe and worth noting if future calls include user/server-controlled strings.

### [LOW] 16. `manifest.webapp` is stale and contains a typo

Committed `manifest.webapp` has `version: "0.1.3"` while `package.json` is `0.1.6`. `yarn start` regenerates it via `d2-manifest`, so the committed file is a stale source of truth — either `.gitignore` it or regenerate on commit. Same file: `"company": "HISP Centre - Univeristy of Oslo"` — typo of "University", repeated in `package.json:40`.

### [LOW] 17. Unused dependency: jquery

`package.json:6` lists `jquery`, and `webpack.config.js:117-121` provides `$` / `jQuery` / `window.jQuery` globally, but nothing in `src/` imports or uses jQuery. Materialize CSS v1 _can_ use jQuery internally but works without it for the features used here (tabs, toasts). Drop the dependency or document why it stays.

### [LOW] 18. `.DS_Store` files committed and copied into builds

`src/.DS_Store`, `src/img/.DS_Store`, `src/js/.DS_Store`, and the project root `.DS_Store` appear in `git status`. `webpack` is even copying `src/img/.DS_Store` into `build/img/.DS_Store` (6 KiB). Add `**/.DS_Store` to `.gitignore` and the `CopyWebpackPlugin` ignore list.

### [LOW] 19. Production bundle expects a specific URL depth

`src/js/d2api.js:3` uses `baseUrl = "../../.."` in production, which only works when the app is served at `/api/apps/{name}/index.html` (3-deep). DHIS2 deployments may serve apps elsewhere (`/dhis-web-apps/...`, custom paths). Brittle to deployment changes — `@dhis2/app-runtime` resolves base URL at runtime via the manifest if you ever migrate.

### [LOW] 20. `programRuleActions` iterated without a guard

`src/app.js:216` does `for (const action of rule.programRuleActions)` — if a rule comes back with `programRuleActions: undefined`, this throws and aborts that rule's task. The fields query asks for it, so the API normally returns `[]`, but a defensive `?? []` is one line.

### [LOW] 21. `unusedVariablesFilter.setChoices` called once per program in a loop

`src/app.js:158-160` iterates and calls `setChoices` 28 times for "Validate All" instead of one batch call. Choices.js may re-render each time. Negligible at this size, slow at large instances. Build the array first, then call `setChoices` once.

---

## Cleanup performed during testing

- Created and deleted a temporary invalid program rule (`mFityGjQDfr`) to verify the invalid-condition tab.
- Briefly installed and uninstalled the prebuilt zip in DHIS2 before switching to dev-server testing.

## Persistent changes left in place

- `d2auth.json` was repointed from `http://localhost:9595/slt10` to `http://localhost:9021` (`claude` / `Test12345!`).
- DHIS2 `corsWhitelist` was extended from `["http://localhost:3000"]` to `["http://localhost:8081","http://localhost:3000"]`. Required for dev mode given Finding #1.

Both can be reverted if the original setup is preferred.
