# tool-prv-validator — Cleanup release 0.2.0 spec

Date: 2026-04-28
Source review: `review/REVIEW-FINDINGS.md`
Target version: `0.2.0`
Single PR.

## Goal

Address all in-scope findings from the code review in one cleanup release. Behaviour-visible changes (parallel validation, Cancel button, Materialize delete-confirm modal) are part of this scope; the version bump to `0.2.0` reflects them.

## Scope decisions made during brainstorming

| Finding | Decision |
|---|---|
| #1 Dev-server proxy mismatch | Fix: route dev fetches through the existing webpack proxy (Option A). |
| #2 Legacy header bar | **Out of scope.** Behaviour preserved. |
| #3 `window.*` globals + inline `onclick` | Fix. |
| #4 Sequential per-program validation | Fix: parallelize with `pLimit(4)`. |
| #5 Uncancellable validation | Fix: add Cancel button via `AbortController`. |
| #6 Dead-code `alert` branch | Delete. |
| #7 Native `confirm()`/`alert()` | Replace `confirm()` with a Materialize modal. The `alert()` call disappears with #6. |
| #8 Webpack `initialize()` not awaited | Fix as part of #1. |
| #9 `Set-Cookie` split-on-comma | Fix as part of #1. |
| #10 Unstyled Maintenance button | Fix. |
| #11 `parseServerVersion` ignores `major` | Fix. |
| #12 `parseServerVersion` NaN inconsistency | Fix. |
| #13 Duplicate comment in `d2api.js` | Delete. |
| #14 `validateUID` ignores query strings | Fix. |
| #15 `M.toast` HTML rendered without escaping | Add an `escapeHtml` helper, use it. |
| #16 `manifest.webapp` tracked + typo | `git rm --cached`, `.gitignore` it; fix "Univeristy" typo at the source (`package.json`). |
| #17 Unused `jquery` dependency | Remove. |
| #18 `.DS_Store` files committed | Already done on `cleanup` branch. |
| #19 Production URL-depth assumption | **Out of scope.** Documented as known limitation. |
| #20 `programRuleActions` iterated without guard | Fix. |
| #21 `setChoices` called once per program in a loop | Fix. |

## Non-goals

- No migration to `@dhis2/app-runtime` or App Platform.
- No legacy header bar removal or restructuring.
- No new validations or features beyond cancel + parallel.
- No CSS redesign beyond styling the Maintenance button.

## Architectural changes

### A1. Route dev-mode fetches through the webpack proxy

**Why:** the proxy in `webpack.config.js:130-159` is well-formed but unused — `d2api.js` calls the DHIS2 origin directly. Result: dev only works on instances whose `corsWhitelist` includes `http://localhost:8081`, and the failure mode is silent (empty dropdown, console-only CORS errors).

**Files:**
- `src/js/d2api.js`
- `webpack.config.js`

**Changes in `src/js/d2api.js`:**

```diff
-const dhisDevConfig = DHIS_CONFIG;
-const isDev = "baseUrl" in dhisDevConfig;
-const baseUrl = isDev ? dhisDevConfig.baseUrl : "../../..";
+const dhisDevConfig = DHIS_CONFIG;
+const isDev = "baseUrl" in dhisDevConfig;
+// Same-origin in dev: requests go through webpack-dev-server proxy.
+// "../../.." in production: app served at /api/apps/{name}/index.html resolves
+// against the DHIS2 root; see Finding #19 for the limitation this assumes.
+const baseUrl = isDev ? "" : "../../..";
```

```diff
 const getHeaders = () => {
-    let headers = new Headers();
-    if (isDev) {
-        headers.set("Authorization", "Basic " + btoa(dhisDevConfig.username + ":" + dhisDevConfig.password));
-    }
-    return headers;
+    return new Headers();
 };
```

The dev-mode `Authorization` header is removed because the proxy in `webpack.config.js` already injects it (`onProxyReq` sets the header).

After removal, `getHeaders()` is trivial. Inline its return value at each call site or remove the function entirely. Inline is preferred: each handler creates its own `Headers` and sets `Content-Type` only when needed.

**Changes in `webpack.config.js`:**

1. Block module export until `initialize()` resolves. Replace the bare `initialize()` call with an awaited wrapper:

```diff
-async function initialize() {
-    await fetchSessionCookie();
-    console.log("Initialization has completed.");
-}
-
-// Call the initialize function to start the process
-initialize();
-const webpackConfig = { ... };
-module.exports = webpackConfig;
+async function initialize() {
+    await fetchSessionCookie();
+    console.log("Initialization has completed.");
+}
+
+const webpackConfig = { ... };
+
+module.exports = isDevBuild
+    ? initialize().then(() => webpackConfig)
+    : webpackConfig;
```

Webpack 5 supports an exported Promise for async config.

2. Replace the comma-split `Set-Cookie` parsing in `fetchSessionCookie`:

```diff
-const setCookieHeader = response.headers.get("set-cookie");
-if (setCookieHeader) {
-    const jsessionIdCookie = setCookieHeader.split(",").find(header => header.includes("JSESSIONID"));
-    if (jsessionIdCookie) {
-        cookie = jsessionIdCookie.split(";")[0];
-        console.log("JSESSIONID cookie successfully set:", cookie);
-    }
-}
+// node-fetch / undici expose multiple Set-Cookie headers individually.
+const setCookieHeaders = response.headers.getSetCookie?.()
+    ?? (response.headers.raw?.() ?? {})["set-cookie"]
+    ?? [];
+const jsessionIdCookie = setCookieHeaders.find(h => h.includes("JSESSIONID"));
+if (jsessionIdCookie) {
+    cookie = jsessionIdCookie.split(";")[0];
+    console.log("JSESSIONID cookie successfully set:", cookie);
+}
```

The `onProxyRes` handler at `webpack.config.js:149-156` does **not** need the same fix — `proxyRes.headers["set-cookie"]` is already an array in Node's HTTP API and the existing `.find(...)` call works correctly. Only `fetchSessionCookie` needs the change.

**Tests:** the existing Playwright smoke test must pass without any DHIS2 `corsWhitelist` modification on the test instance. Revert the `corsWhitelist` change made during this review (see "Cleanup of testing artifacts" at the end).

### A2. Stop using `window.*` and inline `onclick`

**Why:** the delete button is found by literal-string DOM selector matching its `onclick` attribute (`src/app.js:37,133,354`). Three locations break silently if the global name is ever renamed.

**Files:**
- `src/index.html`
- `src/app.js`

**Changes in `src/index.html`:**

```diff
-<button onclick="window.deleteSelectedVariables()" class="btn waves-effect waves-light red" style="z-index: 0;">
+<button id="deleteSelectedButton" class="btn waves-effect waves-light red" style="z-index: 0;">
     Delete selected
 </button>
```

**Changes in `src/app.js`:**

- Replace every `document.querySelector("button[onclick='window.deleteSelectedVariables()']")` with `document.getElementById("deleteSelectedButton")`. Capture once inside `DOMContentLoaded`, pass into other handlers as a closure variable.
- Convert `window.validateProgramRules = async function (programIds = null) { ... }` to a module-scoped `async function validateProgramRules(programIds = null) { ... }`. Same for `window.deleteSelectedVariables`.
- Wire the delete button via `addEventListener("click", openDeleteConfirmModal)` (see A5 for the modal handler).
- Remove the `window.` assignments.

### A3. Parallelize program-level validation

**Why:** `app.js:164` runs programs sequentially even though `pLimit(10)` already caps rule-level concurrency per program. With 28 programs and ~2,700 rules on a typical instance, "Validate All" is sequential where it doesn't need to be.

**File:** `src/app.js`

**Concurrency model:**
- `programLimit = pLimit(4)` — programs in flight.
- `ruleLimit = pLimit(10)` — shared across all programs (created once before the program loop, not per-program). This caps total in-flight rule-evaluation requests at 10, not 4×10=40, which is gentler on DHIS2.

**Progress bar:**

The current per-program nested-interval math in `app.js:172-179` becomes simpler with one shared counter:

```js
let totalRules = 0;
let completedRules = 0;
const programDataPromises = selectedPrograms.map(p => programLimit(async () => {
    const [rulesResp, prvsResp] = await Promise.all([
        d2Get(`api/programRules.json?fields=...&filter=program.id:eq:${p.id}`, { signal }),
        d2Get(`api/programRuleVariables.json?fields=...&filter=program.id:eq:${p.id}`, { signal }),
    ]);
    return { program: p, rules: rulesResp.programRules, prvs: prvsResp.programRuleVariables };
}));
const programData = await Promise.all(programDataPromises);
totalRules = programData.reduce((n, pd) => n + pd.rules.length, 0);

// ... rule processing for all programs runs concurrently within ruleLimit:
const ruleTasks = programData.flatMap(({ program, rules, prvs }) =>
    rules.map(rule => ruleLimit(() => processRule(program, rule, prvs)))
);
ruleTasks.forEach(t => t.then(() => {
    completedRules++;
    progressCombinedBar.style.width = `${(completedRules / totalRules) * 100}%`;
}));
const results = await Promise.all(ruleTasks);
```

Per-program result aggregation (filling the three result tables) happens after all rule tasks resolve, grouped by program for stable rendering order.

**Edge case:** if `totalRules === 0` (selected programs have no rules), set the progress bar to 100% immediately and skip the rule loop.

### A4. Cancel button via `AbortController`

**Why:** Validate All on a large instance is uninterruptible. Combined with A3's speedup this is less critical, but the user can still mis-click and want out.

**Files:**
- `src/index.html`
- `src/app.js`
- `src/js/d2api.js`

**Changes in `src/index.html`:**
Add a Cancel button next to the Validate buttons, hidden by default:

```diff
 <button id="validateAllButton" class="btn waves-effect waves-light">
     Validate All
 </button>
+<button id="cancelButton" class="btn waves-effect waves-light grey" style="display: none;">
+    Cancel
+</button>
```

**Changes in `src/app.js`:**
- One `currentController` module variable, set on each validation start, reset to `null` in `.finally`.
- Both Validate handlers create the controller, pass `controller.signal` to `validateProgramRules`.
- Cancel button click: `currentController?.abort()`. Hide the cancel button. Validate buttons get re-enabled by the existing `.finally`.
- Show cancel button at start of validation, hide on completion or abort.

```js
let currentController = null;

function startValidation(programIds) {
    currentController = new AbortController();
    cancelButton.style.display = "";  // show
    return validateProgramRules(programIds, currentController.signal)
        .finally(() => {
            cancelButton.style.display = "none";
            currentController = null;
        });
}

cancelButton.addEventListener("click", () => currentController?.abort());
```

**Changes in `src/js/d2api.js`:**
Thread `signal` through every helper:

```diff
-export const d2Get = async (endpoint) => {
+export const d2Get = async (endpoint, { signal } = {}) => {
     ...
-    let response = await fetch(baseUrl + endpoint, { method: "GET", headers });
+    let response = await fetch(baseUrl + endpoint, { method: "GET", headers, signal });
     ...
 };
```

Same for `d2PostPlain`, `d2PostJson`, `d2PutJson`, `d2Delete`.

In all `catch` clauses, swallow `AbortError` silently (don't log, don't push into the invalid-expressions arrays):

```js
} catch (error) {
    if (error.name === "AbortError") throw error;  // re-throw to let caller stop
    invalidConditionExpressions.push("Condition validation error");
}
```

**On abort:**
- `validateProgramRules` catches the `AbortError` from any fetch, stops processing, returns. The `.finally` in `startValidation` hides the cancel button and re-enables Validate.
- Already-rendered table rows stay (partial results are useful).
- Progress bar hides via the existing `.finally`.
- The outer `try/catch` at `app.js:310` (`console.error("Validation failed", error)`) must explicitly check for `AbortError` and return early without logging — otherwise every cancel writes a noisy stack trace to the console:
  ```js
  } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Validation failed", error);
  }
  ```
- This applies to abort timing in *every* phase: during the initial `d2Get` for programs (under `programLimit` in A3), during program-data fetches, and during rule-evaluation fetches. Any in-flight `fetch` call sharing the controller's signal will reject with `AbortError`, which propagates up through `Promise.all` to the outer catch.

### A5. Replace `confirm()` with a Materialize modal

**Why:** the rest of the app uses Materialize for UI; `confirm()` breaks the look and is harder to test/style.

**Files:**
- `src/index.html`
- `src/app.js`

**Changes in `src/index.html`:**
Add a hidden modal at the bottom of `#mainView`:

```html
<div id="deleteConfirmModal" class="modal">
    <div class="modal-content">
        <h5>Delete <span id="deleteConfirmCount"></span> unused variable(s)?</h5>
        <p>This action cannot be undone.</p>
    </div>
    <div class="modal-footer">
        <a href="#!" class="modal-close btn-flat">Cancel</a>
        <a href="#!" id="deleteConfirmButton" class="modal-close btn red">Delete</a>
    </div>
</div>
```

**Changes in `src/app.js`:**
- Initialise modal on `DOMContentLoaded`: `M.Modal.init(document.querySelectorAll(".modal"));`.
- Refactor `deleteSelectedVariables()` so the actual deletion logic lives in a private `performDeletion(ids)` and the click handler on the visible "Delete selected" button:
  1. Reads the selected ids.
  2. If empty: `M.toast({ html: "No variables selected for deletion.", classes: "red" })` and return (preserves current behaviour).
  3. Otherwise: write the count into `#deleteConfirmCount`, open the modal.
- Modal's `#deleteConfirmButton` calls `performDeletion(ids)`.

The previous `confirm()` line at `app.js:327` and the dead-code `alert(...)` from #6 both go away.

## Mechanical fixes (one commit)

Every item below is a single-file, < 10-line change.

### M1 — Delete dead `alert`
`src/app.js:64-66`: remove the `else { alert(...) }` branch. The button is disabled when no programs are selected, so the branch is unreachable.

### M2 — Style the Maintenance button
`src/app.js:269,283`:
```diff
-btn.innerText = "Maintenance";
+btn.className = "btn btn-small";
+btn.innerText = "Maintenance";
```

### M3 — Major+minor version comparison
`src/js/check-header-bar.js:22` (`shouldLoadLegacyHeaderBar`):
```diff
-return versionInfo.minor < 42;
+return versionInfo.major < 2 || (versionInfo.major === 2 && versionInfo.minor < 42);
```

### M4 — NaN-safe `parseServerVersion`
`src/js/check-header-bar.js`:
```diff
 return {
-    major: parseInt(majorStr, 10),
-    minor: parseInt(minorStr, 10),
-    patch: parseInt(patchStr, 10),
+    major: parseInt(majorStr, 10) || 0,
+    minor: parseInt(minorStr, 10) || 0,
+    patch: parseInt(patchStr, 10) || 0,
     snapshot
 };
```
With M3's check, `0.0.0` evaluates to "load legacy", consistent with the `catch` branch.

### M5 — Drop duplicate comment
`src/js/d2api.js:27-28`: delete the second `// Ensure the final format is /api/...` line.

### M6 — `validateUID` strips query strings
`src/js/d2api.js:33`:
```diff
-const uid = endpoint.split("/").pop();
+const uid = endpoint.split("/").pop().split("?")[0];
```

### M7 — `escapeHtml` helper for `M.toast`

Add a small helper in `src/app.js`:
```js
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
```

Use at every `M.toast` call:
```diff
-M.toast({ html: `Deleted ${successCount} variables.`, classes: "green" });
+M.toast({ html: `Deleted ${escapeHtml(successCount)} variables.`, classes: "green" });
```

Values are integers today, but the helper documents the intent.

### M8 — `manifest.webapp` ignored + typo fixed at source

- `package.json:40`: `"company": "HISP Centre - University of Oslo"` (note: also the version mismatch at `manifest.webapp`'s `version: 0.1.3` will resolve naturally because the file becomes ignored).
- `git rm --cached manifest.webapp`.
- Append to `.gitignore`:
```
manifest.webapp
```

### M9 — Remove jquery
- `package.json`: remove `"jquery": "^3.7.1"` from `dependencies`.
- `webpack.config.js:117-121`: delete the `webpack.ProvidePlugin({ $: "jquery", jQuery: "jquery", "window.jQuery": "jquery" })` entry.
- Run `yarn install` to regenerate `yarn.lock`.

Verify nothing else references `$` or `jQuery`:
```
grep -rE "(\$\(|jQuery)" src/
```
Expected: no hits.

Materialize CSS 1.0 ships a vanilla-JS bundle (`materialize-css/dist/js/materialize.min.js`). The project already calls the vanilla `M.*` API (`M.Tabs.init`, `M.toast`), so removal is safe.

### M10 — Guard `programRuleActions` iteration
`src/app.js:216`:
```diff
-for (const action of rule.programRuleActions) {
+for (const action of (rule.programRuleActions ?? [])) {
```

### M11 — Batch `setChoices`
`src/app.js:158-160`:
```diff
-unusedVariablesFilter.clearStore();
-selectedPrograms.forEach(program => {
-    unusedVariablesFilter.setChoices([{ value: program.id, label: program.name }], "value", "label", false);
-});
+unusedVariablesFilter.clearStore();
+unusedVariablesFilter.setChoices(
+    selectedPrograms.map(p => ({ value: p.id, label: p.name })),
+    "value", "label", false,
+);
```

## Verification

**Static:**
- `yarn lint` clean.
- `grep -rE "(\$\(|jQuery)" src/` returns no hits.
- `git status` shows `manifest.webapp` no longer tracked, regenerated by `yarn start` if the file is removed locally.

**Existing Playwright suite (must pass without DHIS2-side CORS edits):**
- App loads, programs dropdown populated.
- Validate Selected disabled with no selection.
- Validate All enabled at idle.
- Delete Selected disabled at idle.
- Tab switching.
- Validate single program (Malaria Foci) → 2 unused PRVs.
- Validate larger program (Animal Health) → 3 unused PRVs.
- Invalid condition row rendering with injected bad rule, including styled Maintenance button.
- Select-all / Unselect-all / Single-row check enables Delete.
- Filter by Programme.
- No console errors / no failed requests / no 4xx API responses.

**New Playwright steps:**
- **Cancel:** start "Validate All", wait until ≥10% progress, click Cancel. Assert: cancel button hides, Validate buttons re-enable, progress container hides, partial rows already in tables remain, no `AbortError` logged in console.
- **Modal delete confirm — dismiss path:** select 1 unused variable, click "Delete selected", assert modal opens with count "1", click Cancel inside modal, assert modal closes, no DELETE request fired.
- **Modal delete confirm — confirm path:** create a temporary unused PRV via API, run validation, select that PRV's row, click Delete, click Delete inside the modal, assert single DELETE request to `/api/programRuleVariables/{uid}` and row removal. Clean up.
- **Parallel validation timing (sanity, not strict):** validate two known small programs together, assert wall-clock time is meaningfully less than the sum of their individual timings (lower bound: ~60% of sum). Implementation note: this is a regression check against accidental re-serialization, not a precise benchmark.

**Manual:**
- Run `yarn start` against a fresh DHIS2 instance whose `corsWhitelist` does *not* include `http://localhost:8081`. Confirm the app loads programs (proves A1 is correctly proxying).

## Release packaging

**One PR titled "Cleanup release 0.2.0".**

Suggested commit topology (one commit per group, in this order):
1. `M1-M11` mechanical fixes (one commit, can be small).
2. `A1` proxy fix.
3. `A2` remove window globals.
4. `A3` parallelize validation.
5. `A4` cancel button.
6. `A5` Materialize delete-confirm modal.
7. Test additions (new Playwright steps committed with the changes they exercise, or as one trailing commit if simpler).
8. `package.json` version bump to `0.2.0`.
9. `CHANGELOG.md` update with a flat list of the changes.

The commits in the `cleanup` branch from this session (`23e44b3` ignore .DS_Store, `87b84a1` review docs) stay in this PR's history.

## Cleanup of testing artifacts (after PR merges)

Revert the persistent changes left in place during the original review:
- DHIS2 `corsWhitelist` back to `["http://localhost:3000"]` (or whatever the user prefers post-A1).
- Decide whether to keep `d2auth.json` repointed at `localhost:9021` or revert.

These don't go in the PR — they're operator-side cleanup.

## Open questions

None. Decisions are captured in the "Scope decisions" table above.
