# Cleanup Release 0.2.0 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address all in-scope findings from `review/REVIEW-FINDINGS.md` per the design spec at `review/2026-04-28-cleanup-release-spec.md`, ship as version `0.2.0`.

**Architecture:** Vanilla-JS DHIS2 webapp (Webpack 5 bundle). No unit-test runner exists; verification is `yarn lint` + dev-server smoke + Playwright UI tests. Plan walks the mechanical fixes (M1-M11) first to build commit cadence, then the five architectural changes (A1-A5), then test additions and release packaging.

**Tech Stack:** JavaScript (ES modules), Webpack 5, Materialize CSS 1.0, Choices.js 11, p-limit, Playwright (Python) for UI tests.

**Pre-condition:** working in the `cleanup` branch, current HEAD is `72d4695`. The dev DHIS2 instance is at `http://localhost:9021` (`claude` / `Test12345!`); `d2auth.json` already points there.

---

## Task ordering rationale

Mechanical fixes (T1-T11) first — each is small, safe, builds momentum. Architectural changes (T12-T16) next, in dependency order: A1 (proxy) and A2 (globals) are independent and can land in either order; A3 (parallelize) and A4 (cancel) share the validation entry point so A3 lands first; A5 (modal) is independent. Test additions (T17) come after to exercise the new behaviours. Release packaging (T18) is last.

---

## T1: M1 — Delete dead `alert` branch

**Files:**
- Modify: `src/app.js:52-67`

**Why:** The `else { alert(...) }` branch in `validateSelectedButton.onclick` is unreachable because the button is forcibly disabled when no programs are selected (`src/app.js:49`).

- [ ] **Step 1: Edit `src/app.js`**

Replace the body of `validateSelectedButton.onclick` (currently lines 52-67) so the conditional and the unreachable `else` are gone:

```diff
 validateSelectedButton.onclick = function () {
     const selectedProgramIds = programChoices.getValue(true);
-    if (selectedProgramIds.length > 0) {
-        validateSelectedButton.disabled = true;
-        validateAllButton.disabled = true;
-        deleteSelectedButton.disabled = true;
-        progressContainer.style.display = "block";
-        window.validateProgramRules(selectedProgramIds).finally(() => {
-            validateSelectedButton.disabled = false;
-            validateAllButton.disabled = false;
-            progressContainer.style.display = "none";
-        });
-    } else {
-        alert("Please select at least one program to validate.");
-    }
+    validateSelectedButton.disabled = true;
+    validateAllButton.disabled = true;
+    deleteSelectedButton.disabled = true;
+    progressContainer.style.display = "block";
+    window.validateProgramRules(selectedProgramIds).finally(() => {
+        validateSelectedButton.disabled = false;
+        validateAllButton.disabled = false;
+        progressContainer.style.display = "none";
+    });
 };
```

- [ ] **Step 2: Run lint**

```bash
yarn lint
```
Expected: clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "Remove unreachable alert in validateSelectedButton handler"
```

---

## T2: M5 — Delete duplicate comment in `d2api.js`

**Files:**
- Modify: `src/js/d2api.js:27-28`

- [ ] **Step 1: Edit `src/js/d2api.js`**

Lines 27 and 28 are both `// Ensure the final format is /api/...`. Delete one of them.

- [ ] **Step 2: Run lint**

```bash
yarn lint
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/js/d2api.js
git commit -m "Remove duplicate comment in formatEndpoint"
```

---

## T3: M6 — `validateUID` strips query string

**Files:**
- Modify: `src/js/d2api.js:32-35`

- [ ] **Step 1: Edit `src/js/d2api.js`**

```diff
 const validateUID = (endpoint) => {
-    const uid = endpoint.split("/").pop();
+    const uid = endpoint.split("/").pop().split("?")[0];
     return /^[A-Za-z0-9]{11}$/.test(uid);
 };
```

- [ ] **Step 2: Run lint**

```bash
yarn lint
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/js/d2api.js
git commit -m "validateUID: ignore query string when checking UID"
```

---

## T4: M3 + M4 — Robust version comparison in `check-header-bar.js`

**Files:**
- Modify: `src/js/check-header-bar.js`

**Why:** combining M3 (use both `major` and `minor`) and M4 (NaN-safe parsing) into one commit because they touch the same two functions and reading them together is clearer.

- [ ] **Step 1: Edit `parseServerVersion`**

```diff
 function parseServerVersion(versionString) {
     const snapshot = versionString.includes("SNAPSHOT");
     const cleanedVersion = versionString.replace("-SNAPSHOT", "");
     const [majorStr, minorStr, patchStr = "0"] = cleanedVersion.split(".");

     return {
-        major: parseInt(majorStr, 10),
-        minor: parseInt(minorStr, 10),
-        patch: parseInt(patchStr, 10),
+        major: parseInt(majorStr, 10) || 0,
+        minor: parseInt(minorStr, 10) || 0,
+        patch: parseInt(patchStr, 10) || 0,
         snapshot
     };
 }
```

- [ ] **Step 2: Edit `shouldLoadLegacyHeaderBar`**

```diff
 async function shouldLoadLegacyHeaderBar() {
     try {
         const response = await d2Get("api/system/info.json?fields=version");
         const versionInfo = parseServerVersion(response.version || "0.0.0");
-        return versionInfo.minor < 42;
+        return versionInfo.major < 2 || (versionInfo.major === 2 && versionInfo.minor < 42);
     } catch (error) {
         console.error("Error fetching server version:", error);
         return true;
     }
 }
```

- [ ] **Step 3: Run lint**

```bash
yarn lint
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/js/check-header-bar.js
git commit -m "Use major+minor for legacy header bar check, NaN-safe parsing"
```

---

## T5: M2 — Style the Maintenance button

**Files:**
- Modify: `src/app.js:269-272` and `src/app.js:283-286`

**Why:** the dynamically-created Maintenance button currently has no CSS classes; it renders as a default OS button. Add Materialize classes for consistency.

- [ ] **Step 1: Edit `src/app.js`**

Both occurrences of the Maintenance button creation should set `className`:

```diff
                 const cell = row.insertCell(4);
                 const btn = document.createElement("button");
+                btn.className = "btn btn-small";
                 btn.innerText = "Maintenance";
                 btn.onclick = () => window.open(ruleLink, "_blank");
                 cell.appendChild(btn);
```

Apply this once at the invalid-conditions render (around `app.js:269`) and once at the invalid-actions render (around `app.js:283`).

- [ ] **Step 2: Run lint**

```bash
yarn lint
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "Style Maintenance buttons with Materialize classes"
```

---

## T6: M10 — Guard `programRuleActions` iteration

**Files:**
- Modify: `src/app.js:216`

- [ ] **Step 1: Edit `src/app.js`**

```diff
-                for (const action of rule.programRuleActions) {
+                for (const action of (rule.programRuleActions ?? [])) {
```

- [ ] **Step 2: Run lint**

```bash
yarn lint
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "Guard against missing programRuleActions"
```

---

## T7: M11 — Batch `setChoices` calls

**Files:**
- Modify: `src/app.js:156-160`

- [ ] **Step 1: Edit `src/app.js`**

```diff
         unusedVariablesFilter.clearStore();
-
-        selectedPrograms.forEach(program => {
-            unusedVariablesFilter.setChoices([{ value: program.id, label: program.name }], "value", "label", false);
-        });
+        unusedVariablesFilter.setChoices(
+            selectedPrograms.map(p => ({ value: p.id, label: p.name })),
+            "value",
+            "label",
+            false,
+        );
```

- [ ] **Step 2: Run lint**

```bash
yarn lint
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "Batch setChoices calls into one per validation run"
```

---

## T8: M7 — `escapeHtml` helper for `M.toast`

**Files:**
- Modify: `src/app.js`

**Why:** all current `M.toast` calls pass `html:` strings. The interpolated values (success/failure counts) are integers today, so there's no actual XSS, but using a helper documents intent and protects future edits.

- [ ] **Step 1: Add helper near the top of `src/app.js` (after the imports and before `DOMContentLoaded`)**

```js
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
```

- [ ] **Step 2: Update all three `M.toast` call sites in `deleteSelectedVariables` (`src/app.js:323,346,349`)**

```diff
-        M.toast({ html: "No variables selected for deletion.", classes: "red" });
+        M.toast({ html: escapeHtml("No variables selected for deletion."), classes: "red" });
```

```diff
-            M.toast({ html: `Deleted ${successCount} variables.`, classes: "green" });
+            M.toast({ html: `Deleted ${escapeHtml(successCount)} variables.`, classes: "green" });
```

```diff
-            M.toast({ html: `Failed to delete ${failureCount} variables.`, classes: "red" });
+            M.toast({ html: `Failed to delete ${escapeHtml(failureCount)} variables.`, classes: "red" });
```

The terminal `M.toast({ html: "Deletion failed.", classes: "red" })` at line 358 is also a static string — apply the same wrapper for consistency.

- [ ] **Step 3: Run lint**

```bash
yarn lint
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app.js
git commit -m "Add escapeHtml helper for M.toast calls"
```

---

## T9: M8 — Fix "Univeristy" typo and gitignore `manifest.webapp`

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Delete from index: `manifest.webapp`

- [ ] **Step 1: Fix typo in `package.json:40`**

```diff
-      "company": "HISP Centre - Univeristy of Oslo",
+      "company": "HISP Centre - University of Oslo",
```

- [ ] **Step 2: Append to `.gitignore`**

```
manifest.webapp
```

- [ ] **Step 3: Untrack `manifest.webapp`**

```bash
git rm --cached manifest.webapp
```

- [ ] **Step 4: Regenerate locally to confirm no behaviour change**

```bash
yarn run manifest
cat manifest.webapp
```
Expected: file regenerates at the project root, contains the corrected company name and version `0.1.6` (or whatever's current in `package.json`).

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore
git commit -m "Untrack manifest.webapp, fix University typo at source"
```

---

## T10: M9 — Remove jquery dependency

**Files:**
- Modify: `package.json`
- Modify: `webpack.config.js:117-121`
- Modify: `yarn.lock` (regenerated)

- [ ] **Step 1: Verify nothing in `src/` references jQuery**

```bash
grep -rE "(\\\$\\(|jQuery|require\\(['\"]jquery['\"]\\))" src/
```
Expected: no matches. (Materialize is invoked only via `M.*` API in `src/app.js`.)

- [ ] **Step 2: Remove from `package.json`**

```diff
   "dependencies": {
     "choices.js": "^11.0.2",
-    "jquery": "^3.7.1",
     "materialize-css": "^1.0.0",
     "p-limit": "^6.2.0"
   },
```

- [ ] **Step 3: Remove `ProvidePlugin` from `webpack.config.js:117-121`**

```diff
-        new webpack.ProvidePlugin({
-            $: "jquery",
-            jQuery: "jquery",
-            "window.jQuery": "jquery"
-        }),
```

- [ ] **Step 4: Reinstall dependencies**

```bash
yarn install
```
Expected: `yarn.lock` updated, `node_modules/jquery` removed.

- [ ] **Step 5: Smoke test the dev server**

```bash
yarn start &
# Wait for "compiled successfully", visit http://localhost:8081/, confirm app loads with no console errors
```
Expected: app loads exactly as before.

- [ ] **Step 6: Stop dev server**

- [ ] **Step 7: Commit**

```bash
git add package.json webpack.config.js yarn.lock
git commit -m "Remove unused jquery dependency"
```

---

## T11: A1 — Route dev fetches through the webpack proxy

**Files:**
- Modify: `src/js/d2api.js:1-12`
- Modify: `webpack.config.js`

**Why:** the proxy in `webpack.config.js` is well-formed but unused — `d2api.js` calls the DHIS2 origin directly. Result: dev only works on instances whose `corsWhitelist` includes `http://localhost:8081`. After this fix, no DHIS2-side configuration is needed.

- [ ] **Step 1: Edit `src/js/d2api.js`**

```diff
 const dhisDevConfig = DHIS_CONFIG;
 const isDev = "baseUrl" in dhisDevConfig;
-const baseUrl = isDev ? dhisDevConfig.baseUrl : "../../..";
+// Same-origin in dev: requests go through webpack-dev-server proxy.
+// "../../.." in production: app served at /api/apps/{name}/index.html resolves
+// against the DHIS2 root.
+const baseUrl = isDev ? "" : "../../..";

-// Helper function to set headers for development mode
-const getHeaders = () => {
-    let headers = new Headers();
-    if (isDev) {
-        headers.set("Authorization", "Basic " + btoa(dhisDevConfig.username + ":" + dhisDevConfig.password));
-    }
-    return headers;
-};
+// Headers helper. In dev, the webpack proxy injects Authorization automatically.
+const getHeaders = () => new Headers();
```

- [ ] **Step 2: Edit `webpack.config.js` — block on `initialize()` before exporting**

Replace the trailing `initialize();` call and `module.exports = webpackConfig;` with a Promise-returning export:

```diff
-async function initialize() {
-    await fetchSessionCookie();
-    console.log("Initialization has completed.");
-}
-
-// Call the initialize function to start the process
-initialize();
-const webpackConfig = { ... };
-
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

(Webpack 5 supports an exported Promise.)

- [ ] **Step 3: Edit `webpack.config.js` — fix `Set-Cookie` parsing in `fetchSessionCookie`**

```diff
-        const setCookieHeader = response.headers.get("set-cookie");
-        if (setCookieHeader) {
-            const jsessionIdCookie = setCookieHeader.split(",").find(header => header.includes("JSESSIONID"));
-            if (jsessionIdCookie) {
-                cookie = jsessionIdCookie.split(";")[0];
-                console.log("JSESSIONID cookie successfully set:", cookie);
-            }
-        }
+        // Node 18+ undici: getSetCookie() returns array of individual headers.
+        // Older fetch polyfills: fall back to headers.raw().
+        const setCookieHeaders = response.headers.getSetCookie?.()
+            ?? (response.headers.raw?.() ?? {})["set-cookie"]
+            ?? [];
+        const jsessionIdCookie = setCookieHeaders.find(h => h.includes("JSESSIONID"));
+        if (jsessionIdCookie) {
+            cookie = jsessionIdCookie.split(";")[0];
+            console.log("JSESSIONID cookie successfully set:", cookie);
+        }
```

The `onProxyRes` handler at `webpack.config.js:149-156` does **not** need changing — `proxyRes.headers["set-cookie"]` is already an array in Node's HTTP API.

- [ ] **Step 4: Smoke test against an instance with NO CORS allowlist for `:8081`**

Revert the `corsWhitelist` change made during the original review:
```bash
curl -s -u "claude:Test12345!" -X POST -H "Content-Type: application/json" \
  "http://localhost:9021/api/configuration/corsWhitelist" \
  -d '["http://localhost:3000"]'
```

- [ ] **Step 5: Run dev server, confirm app loads programs**

```bash
yarn start &
# Wait for "compiled successfully", open http://localhost:8081/
# Verify: programs dropdown populated, no CORS errors in console
```
Expected: app fully functional without `:8081` in `corsWhitelist`.

- [ ] **Step 6: Stop dev server, run lint**

```bash
yarn lint
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/js/d2api.js webpack.config.js
git commit -m "Route dev-mode fetches through webpack proxy

- d2api.js: baseUrl is empty in dev (same-origin), proxy handles auth
- webpack.config.js: await initialize() before exporting config
- webpack.config.js: parse Set-Cookie via getSetCookie()/headers.raw()
  rather than splitting on commas

Removes the silent CORS failure mode where the app loads HTML but
no API data unless the DHIS2 corsWhitelist includes :8081.
"
```

---

## T12: A2 — Stop using `window.*` globals and inline `onclick`

**Files:**
- Modify: `src/index.html:105-107`
- Modify: `src/app.js`

- [ ] **Step 1: Edit `src/index.html`**

```diff
-                    <button onclick="window.deleteSelectedVariables()" class="btn waves-effect waves-light red" style="z-index: 0;">
+                    <button id="deleteSelectedButton" class="btn waves-effect waves-light red" style="z-index: 0;">
                         Delete selected
                     </button>
```

- [ ] **Step 2: Replace selectors and global assignments in `src/app.js`**

Three brittle `querySelector` calls become `getElementById`:

```diff
-    const deleteSelectedButton = document.querySelector("button[onclick='window.deleteSelectedVariables()']");
+    const deleteSelectedButton = document.getElementById("deleteSelectedButton");
```

```diff
-        const deleteSelectedButton = document.querySelector("button[onclick='window.deleteSelectedVariables()']");
+        const deleteSelectedButton = document.getElementById("deleteSelectedButton");
```

(applied at `src/app.js:133` inside the `selectAllCheckbox.onclick` handler and at `src/app.js:354` near the end of `deleteSelectedVariables`)

- [ ] **Step 3: Convert `window.validateProgramRules` and `window.deleteSelectedVariables` to module-scoped functions**

```diff
-window.validateProgramRules = async function (programIds = null) {
+async function validateProgramRules(programIds = null) {
```

```diff
-window.deleteSelectedVariables = async function () {
+async function deleteSelectedVariables() {
```

- [ ] **Step 4: Wire the delete button via `addEventListener` inside `DOMContentLoaded`**

After `deleteSelectedButton.disabled = true;` (around current line 38), add:

```js
deleteSelectedButton.addEventListener("click", deleteSelectedVariables);
```

Update the two existing `window.validateProgramRules(...)` callers in the validate-button handlers to call the local function name.

- [ ] **Step 5: Run lint**

```bash
yarn lint
```
Expected: clean.

- [ ] **Step 6: Smoke test in dev**

```bash
yarn start &
# Open http://localhost:8081/, validate "Malaria Foci Investigation",
# go to Unused Variables tab, tick a row, click Delete selected (cancel the native confirm),
# confirm the click handler still fires (no console errors, button state changes).
```

- [ ] **Step 7: Stop dev server, commit**

```bash
git add src/index.html src/app.js
git commit -m "Remove window.* globals and inline onclick

The delete button is now identified by id and wired via addEventListener.
validateProgramRules and deleteSelectedVariables become module-scoped.
"
```

---

## T13: A3 — Parallelize program-level validation

**Files:**
- Modify: `src/app.js` — body of `validateProgramRules`

**Why:** the per-program loop is currently sequential. Inner `pLimit(10)` controls rule-level concurrency within one program, but program-level work can run in parallel too.

- [ ] **Step 1: Refactor `validateProgramRules` to fetch program data in parallel**

Replace the body of `validateProgramRules` (everything after the initial `unusedVariablesFilter.clearStore()` setup, currently `src/app.js:162-307`) with a parallel data-fetch phase, a unified rule-evaluation phase, and an aggregation/render phase.

Structural sketch:

```js
const programLimit = pLimit(4);
const ruleLimit = pLimit(10);

// Phase 1: in parallel, fetch rules + PRVs for each selected program.
const programData = await Promise.all(selectedPrograms.map(program =>
    programLimit(async () => {
        const [rulesResp, prvsResp] = await Promise.all([
            d2Get(`api/programRules.json?fields=name,id,condition,programRuleActions[data,content,description]&paging=false&filter=program.id:eq:${program.id}`),
            d2Get(`api/programRuleVariables.json?fields=name,id,program[id]&paging=false&filter=program.id:eq:${program.id}`),
        ]);
        return {
            program,
            rules: rulesResp.programRules,
            prvs: prvsResp.programRuleVariables,
        };
    })
));

// Phase 2: progress accounting + rule evaluation in parallel across all programs.
const totalRules = programData.reduce((n, pd) => n + pd.rules.length, 0);
let completedRules = 0;
const updateProgress = () => {
    completedRules++;
    const pct = totalRules > 0 ? (completedRules / totalRules) * 100 : 100;
    progressCombinedBar.style.width = `${pct}%`;
};

const ruleResults = await Promise.all(programData.flatMap(({ program, rules, prvs }) =>
    rules.map(rule => ruleLimit(async () => {
        const result = await processRule(program, rule, prvs);
        updateProgress();
        return result;
    }))
));

if (totalRules === 0) {
    progressCombinedBar.style.width = "100%";
}

// Phase 3: render all three tables, then unused-variables table grouped by program.
renderInvalidExpressionRows(ruleResults);
renderUnusedVariablesByProgram(programData, ruleResults);
```

`processRule(program, rule, prvs)` is the existing per-rule inner logic (extract `usedVariables`, call the description endpoint twice, push to `invalidConditionExpressions` / `invalidActionExpressions`, return `{ rule, program, invalidConditionExpressions, invalidActionExpressions, usedVariablePrvNames }`).

`renderInvalidExpressionRows` walks `ruleResults` and inserts rows into the two invalid-* tables (same DOM logic as before).

`renderUnusedVariablesByProgram` groups results by program, computes `unusedVariables = prvs.filter(prv => !union(usedVariablePrvNames).has(prv.name))` per program, and inserts rows.

- [ ] **Step 2: Extract `processRule`, `renderInvalidExpressionRows`, `renderUnusedVariablesByProgram` as module-scoped helpers**

Each is pure (input → DOM rows or return value). This isolates the changes from the rest of `app.js`.

- [ ] **Step 3: Run lint**

```bash
yarn lint
```
Expected: clean.

- [ ] **Step 4: Manual smoke test in dev**

```bash
yarn start &
# Open http://localhost:8081/
# Validate Malaria Foci Investigation: expect 0 invalid, 2 unused PRVs (matches pre-change result)
# Validate Animal Health: expect 0 invalid, 3 unused PRVs (matches pre-change result)
# Validate two programs at once: expect their results combined
# Time a Validate All: should be noticeably faster than before, ~30-60s rather than minutes
```

- [ ] **Step 5: Stop dev server, commit**

```bash
git add src/app.js
git commit -m "Parallelize program-level validation

Programs fetch their rules+PRVs concurrently under pLimit(4).
A single shared pLimit(10) caps rule-evaluation requests across
all programs (max ~14 in flight at peak: 4 program-fetches +
10 rule-evaluations).

Progress bar now uses one shared counter (completed / total rules)
rather than per-program nested intervals.
"
```

---

## T14: A4 — Cancel button via `AbortController`

**Files:**
- Modify: `src/index.html`
- Modify: `src/app.js`
- Modify: `src/js/d2api.js`

- [ ] **Step 1: Add cancel button to `src/index.html`**

Inside the validate-button row:

```diff
                         <button id="validateAllButton" class="btn waves-effect waves-light">
                             Validate All
                         </button>
+                        <button id="cancelButton" class="btn waves-effect waves-light grey" style="display: none; margin-left: 10px;">
+                            Cancel
+                        </button>
```

- [ ] **Step 2: Thread `signal` through every API helper in `src/js/d2api.js`**

```diff
-export const d2Get = async (endpoint) => {
+export const d2Get = async (endpoint, { signal } = {}) => {
     try {
         endpoint = formatEndpoint(endpoint);
         let headers = getHeaders();
-        let response = await fetch(baseUrl + endpoint, {
-            method: "GET",
-            headers: headers
-        });
+        let response = await fetch(baseUrl + endpoint, {
+            method: "GET",
+            headers: headers,
+            signal,
+        });
```

Apply the analogous change to `d2PostJson`, `d2PostPlain`, `d2PutJson`, and `d2Delete`. Preserve `AbortError` by re-throwing it from the `catch` blocks (so callers can short-circuit) rather than wrapping it as a network error.

- [ ] **Step 3: Wire cancel into `src/app.js`**

Module-scope state:
```js
let currentController = null;
```

Inside `DOMContentLoaded`:
```js
const cancelButton = document.getElementById("cancelButton");
cancelButton.addEventListener("click", () => currentController?.abort());
```

Wrap both validate handlers in a helper:
```js
function startValidation(programIds) {
    currentController = new AbortController();
    cancelButton.style.display = "";
    return validateProgramRules(programIds, currentController.signal)
        .finally(() => {
            cancelButton.style.display = "none";
            currentController = null;
        });
}
```

Replace the existing `window.validateProgramRules(...)` calls in the two onclick handlers with `startValidation(...)`.

- [ ] **Step 4: Make `validateProgramRules` accept and propagate `signal`**

```js
async function validateProgramRules(programIds, signal) {
    // ... pass { signal } to every d2Get / d2PostPlain call ...
}
```

In each per-rule `catch` clause that records "Condition validation error" / "Action expression validation error", check `error.name === "AbortError"` and re-throw rather than swallow:

```js
} catch (error) {
    if (error.name === "AbortError") throw error;
    invalidConditionExpressions.push("Condition validation error");
}
```

In the outer `try/catch` (current `app.js:310`), suppress AbortError:

```js
} catch (error) {
    if (error.name === "AbortError") return;
    console.error("Validation failed", error);
}
```

- [ ] **Step 5: Run lint**

```bash
yarn lint
```
Expected: clean.

- [ ] **Step 6: Manual smoke test**

```bash
yarn start &
# Click Validate All on the test instance.
# After 5-10 seconds (some progress visible), click Cancel.
# Expected:
#   - Cancel button hides
#   - Progress bar hides
#   - Validate Selected and Validate All re-enabled
#   - Already-rendered table rows remain
#   - No AbortError in the console
```

- [ ] **Step 7: Stop dev server, commit**

```bash
git add src/index.html src/app.js src/js/d2api.js
git commit -m "Add Cancel button via AbortController

A new cancel button is shown while validation runs and aborts all
in-flight fetches when clicked. AbortError is swallowed silently
in the outer catch and per-rule catches; any AbortError thrown
from inside an evaluation re-throws to short-circuit the run.

Signal is threaded through every d2Get / d2PostPlain / d2PostJson /
d2PutJson / d2Delete helper.
"
```

---

## T15: A5 — Replace `confirm()` with Materialize modal

**Files:**
- Modify: `src/index.html`
- Modify: `src/app.js`

- [ ] **Step 1: Add modal markup to `src/index.html`**

Append before the closing `</div>` of `#mainView`:

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

- [ ] **Step 2: Initialise modal in `src/app.js` `DOMContentLoaded`**

Add near other Materialize inits:
```js
M.Modal.init(document.querySelectorAll(".modal"));
```

- [ ] **Step 3: Refactor `deleteSelectedVariables` into open-modal + perform-delete**

```js
let pendingDeletionIds = [];

function openDeleteConfirm() {
    const checkboxes = document.querySelectorAll("#unusedVariablesTable input[type='checkbox']:checked");
    pendingDeletionIds = Array.from(checkboxes)
        .filter(cb => cb.id !== "selectAllCheckbox")
        .map(cb => cb.value);
    if (pendingDeletionIds.length === 0) {
        M.toast({ html: escapeHtml("No variables selected for deletion."), classes: "red" });
        return;
    }
    document.getElementById("deleteConfirmCount").innerText = pendingDeletionIds.length;
    M.Modal.getInstance(document.getElementById("deleteConfirmModal")).open();
}

async function performDeletion() {
    const idsToDelete = pendingDeletionIds;
    pendingDeletionIds = [];
    if (idsToDelete.length === 0) return;
    // ... existing per-id delete loop ...
}
```

The existing `deleteSelectedButton` listener becomes `addEventListener("click", openDeleteConfirm)`. Wire `#deleteConfirmButton`:

```js
document.getElementById("deleteConfirmButton").addEventListener("click", performDeletion);
```

- [ ] **Step 4: Remove the `confirm()` call**

`src/app.js:327` (`if (!confirm("Are you sure...")) return;`) is no longer needed and should be deleted along with the surrounding `try { ... }` reorganisation.

- [ ] **Step 5: Run lint**

```bash
yarn lint
```
Expected: clean.

- [ ] **Step 6: Manual smoke test**

```bash
yarn start &
# Validate Malaria Foci, go to Unused Variables, tick a row, click Delete selected.
# Expected:
#   - Modal opens with "Delete 1 unused variable(s)?"
#   - Click Cancel: modal closes, no API call fired
#   - Click Delete selected again, then Delete inside the modal
#   - Expected: row removed from table, success toast appears
# (For full deletion test, use a temporary PRV created via API.)
```

- [ ] **Step 7: Stop dev server, commit**

```bash
git add src/index.html src/app.js
git commit -m "Replace confirm() with Materialize delete-confirm modal"
```

---

## T16: Add Playwright tests directory

**Files:**
- Create: `tests/playwright/common.py`
- Create: `tests/playwright/test_smoke.py`
- Create: `tests/playwright/test_cancel.py`
- Create: `tests/playwright/test_delete_modal.py`
- Create: `tests/playwright/README.md`

**Why:** the project ships no test infrastructure today. The Playwright scripts written during the original review live in `/tmp/prv-test/` and are not portable. Move them into the project and add the new ones for cancel + modal.

- [ ] **Step 1: Create directory and shared helpers**

`tests/playwright/common.py` (not `conftest.py` — these are standalone scripts, not pytest):
```python
"""Shared fixtures: log in via /api/auth/login, return JSESSIONID cookie."""
import json, os, urllib.request

BASE_URL = os.environ.get("DHIS2_BASE_URL", "http://localhost:9021")
USER = os.environ.get("DHIS2_USER", "claude")
PASSWD = os.environ.get("DHIS2_PASSWORD", "Test12345!")
DEV_URL = os.environ.get("DEV_URL", "http://localhost:8081/")

def get_session_cookie():
    req = urllib.request.Request(
        f"{BASE_URL}/api/auth/login",
        data=json.dumps({"username": USER, "password": PASSWD}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        for c in r.headers.get_all("Set-Cookie") or []:
            head = c.split(";", 1)[0]
            n, _, v = head.partition("=")
            if "JSESSIONID" in n:
                return n.strip(), v.strip()
    raise RuntimeError("No JSESSIONID returned")
```

- [ ] **Step 2: Write the smoke test**

`tests/playwright/test_smoke.py`: standalone script (run as `python3 tests/playwright/test_smoke.py`). Cover the assertions listed in `review/2026-04-28-cleanup-release-spec.md` under "Existing Playwright suite":

1. App loads, programs dropdown populated.
2. `Validate Selected` disabled with no selection.
3. `Validate All` enabled at idle.
4. `Delete Selected` disabled at idle.
5. Tab switching across the three result tabs.
6. Validate single program (Malaria Foci) → 2 unused PRVs.
7. Validate larger program (Animal Health) → 3 unused PRVs.
8. Invalid condition row rendering with an injected bad rule, including styled Maintenance button (className contains `btn`).
9. Select-all / Unselect-all / Single-row check enables Delete.
10. Filter by Programme.
11. No console errors / no failed requests / no 4xx API responses.

Use `from common import BASE_URL, DEV_URL, get_session_cookie` (rename `conftest.py` → `common.py` if not using pytest). Pattern follows the smoke probe template in `review/AGENT-REVIEW-INSTRUCTIONS.md`.

- [ ] **Step 3: Add new cancel test**

`tests/playwright/test_cancel.py`: implement the step from the spec ("Cancel: start Validate All, wait until ≥10% progress, click Cancel. Assert: cancel button hides, Validate buttons re-enable, progress container hides, no AbortError logged in console.")

- [ ] **Step 4: Add modal-confirmation tests**

`tests/playwright/test_delete_modal.py`: implement the dismiss-path test from the spec ("select 1 unused variable, click Delete selected, assert modal opens with count '1', click Cancel inside modal, assert modal closes, no DELETE request fired.")

- [ ] **Step 5: Document how to run**

`tests/playwright/README.md`:
```markdown
# Playwright UI tests

## Prerequisites

- Python 3 + Playwright + Chromium:
  ```
  pip install playwright
  playwright install --with-deps chromium
  ```
- A running DHIS2 instance and the dev server (`yarn start`).

## Running

```
DHIS2_BASE_URL=http://localhost:9021 DHIS2_USER=claude DHIS2_PASSWORD=Test12345! \
  python3 tests/playwright/test_smoke.py
```
```

- [ ] **Step 6: Run each test against the dev server**

```bash
yarn start &
# In another shell:
python3 tests/playwright/test_smoke.py
python3 tests/playwright/test_cancel.py
python3 tests/playwright/test_delete_modal.py
```
Expected: all three pass with no console errors.

- [ ] **Step 7: Stop dev server, commit**

```bash
git add tests/
git commit -m "Add Playwright UI tests under tests/playwright/

Smoke test (existing flows), Cancel-button test, and delete-modal
dismiss-path test. Runnable with python3 against a running dev
server. Documented in tests/playwright/README.md.
"
```

---

## T17: Version bump and CHANGELOG

**Files:**
- Modify: `package.json:4` (version)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump `package.json` version**

```diff
-  "version": "0.1.6",
+  "version": "0.2.0",
```

- [ ] **Step 2: Update `CHANGELOG.md`**

Read the current contents first (it's 84 bytes; structure may be terse). Prepend an entry:

```markdown
## 0.2.0 — 2026-04-28

- Validate programs in parallel (4-wide programs, 10-wide rule evaluation)
- Add Cancel button for in-progress validations
- Replace native confirm() with Materialize modal for delete confirmation
- Route dev-server fetches through the webpack proxy (no DHIS2 corsWhitelist edit needed)
- Remove window.* globals and inline onclick handlers
- Style the Maintenance buttons with Materialize classes
- Robust DHIS2 version comparison in legacy-header-bar check (major+minor, NaN-safe)
- Remove unused jquery dependency
- Untrack manifest.webapp (regenerated on each build)
- Fix "Univeristy" typo
- Numerous small fixes (escapeHtml helper, programRuleActions guard, batched setChoices, etc.)
```

- [ ] **Step 3: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "Bump version to 0.2.0 and update changelog"
```

---

## Final verification

- [ ] **Step 1: Run lint one final time**

```bash
yarn lint
```
Expected: clean.

- [ ] **Step 2: Run a full production build**

```bash
yarn run zip
```
Expected: `compiled/tool-pr-validator.zip` produced; size noticeably similar (jquery removal + dead alert + few small things shed maybe 20-50 KB; legacy header bar still in the bundle per scope decision).

- [ ] **Step 3: Run the full Playwright suite against the production build**

Install the produced zip into the test DHIS2 instance, hit the launch URL, run a manual smoke pass (validate a single program, see results, exercise the cancel + modal). The tests under `tests/playwright/` target the dev server, but a manual prod verification confirms the production `baseUrl` resolution is unbroken (Finding #19's known limitation aside).

- [ ] **Step 4: Open PR**

```bash
git push -u origin cleanup
gh pr create --title "Cleanup release 0.2.0" --body "$(cat <<'EOF'
## Summary

Cleanup release addressing the in-scope findings from the code review.
Spec: review/2026-04-28-cleanup-release-spec.md.

Behaviour changes:
- Programs validated in parallel (substantial speedup on Validate All).
- New Cancel button for in-progress validations.
- Delete confirmation moved from native confirm() to Materialize modal.
- Dev server now works without DHIS2-side corsWhitelist edits.

Plus mechanical fixes (typos, dead code, missing escaping, dependency
cleanup, robust version parsing, batched UI updates).

Out of scope per design decisions:
- Legacy header bar handling (Finding #2): unchanged.
- Production URL-depth assumption (Finding #19): documented limitation.

## Test plan

- [x] yarn lint clean
- [x] Playwright suite under tests/playwright/ passes
- [x] Manual smoke test against production zip install in DHIS2 2.42

## Review docs

- review/REVIEW-FINDINGS.md — original findings
- review/2026-04-28-cleanup-release-spec.md — design spec
- review/2026-04-28-cleanup-release-plan.md — implementation plan

EOF
)"
```

---

## Notes for the implementer

- Single branch (`cleanup`); push as one PR titled "Cleanup release 0.2.0".
- Keep commits granular as specified above — they make the PR review easier.
- If lint fails after any task, fix and amend (not a separate "fix lint" commit) — keep the topology clean.
- If a smoke test reveals an issue with one of the architectural changes (T11-T15), DO NOT proceed to the next architectural change without resolving it; cancel-button and modal both depend on the validateProgramRules signature being stable.
- Operator-side cleanup after merge: revert the DHIS2 `corsWhitelist` to its pre-review value if desired (no longer required after T11). `d2auth.json` is gitignored; leave or revert per local preference.
