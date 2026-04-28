# Recommendations for `dhis2/tool-template`

Cross-references the changes made in this `tool-prv-validator` cleanup release (0.2.0)
against the template at `https://github.com/dhis2/tool-template@main` (commit observed:
default branch, version 0.3.0). Lists generic findings that also apply to the template
and would benefit any future tool scaffolded from it.

Scope: only **template-level changes**. Project-specific work (parallelization, cancel
button, modal, jquery removal, etc.) is intentionally excluded.

## Things the template has already gotten right

These were findings against `tool-prv-validator` that the template does NOT have:

- `.env` + `dotenv` for credentials, with `.env.template` and Personal Access Token
  support — much better than the legacy `d2auth.json`.
- `manifest.webapp` already in `.gitignore`.
- No `jquery` dependency.
- No duplicate comment in `d2api.js`.
- `[contenthash]` instead of the deprecated `[hash]` in webpack output filenames.
- `AGENTS.md` describing project conventions for AI agents.

Skip these.

## High-priority fixes that DO apply

### 1. Dev-mode fetches bypass the webpack proxy

**File:** `src/js/d2api.js`

```diff
-const baseUrl = isDev ? dhisDevConfig.baseUrl : "../../..";
+// Same-origin in dev: requests go through the webpack-dev-server proxy,
+// which injects Authorization. "../../.." in production: app served at
+// /api/apps/{name}/index.html resolves against the DHIS2 root.
+const baseUrl = isDev ? "" : "../../..";
```

Currently `d2Get`/`d2PostJson` etc. use `dhisDevConfig.baseUrl` (e.g.
`http://localhost:8080/dhis`) directly, which is cross-origin from `localhost:8081`
where the dev server runs. The browser blocks every call with CORS unless the DHIS2
instance has `http://localhost:8081` in its `corsWhitelist`. The proxy in
`webpack.config.js` is well-formed but never used.

After the fix, dev fetches go to `/api/...` (same-origin), hit the dev-server proxy,
and get forwarded to DHIS2 with the proxy's Authorization header. No DHIS2-side
config edit needed.

### 2. Strip `Origin` / `Referer` in the proxy's `onProxyReq`

**File:** `src/webpack.config.js` (around the `onProxyReq` callback)

```diff
 onProxyReq: (proxyReq) => {
     if (cookie) {
         proxyReq.setHeader("Cookie", cookie);
     } else {
         console.warn("No cookie found");
     }
+    // Strip the browser's Origin header. Browsers send Origin on every
+    // non-GET request; DHIS2 2.42+ then applies CORS and returns a 200 with
+    // an empty body when the origin is not on its corsWhitelist. Removing
+    // it makes DHIS2 treat the request as same-origin.
+    proxyReq.removeHeader("Origin");
+    proxyReq.removeHeader("Referer");
 },
```

This is the subtle one. After the fix in #1, GETs work fine through the proxy.
But any POST through the proxy still ships the browser's `Origin: http://localhost:8081`
header. DHIS2 2.42 returns HTTP 200 with `Content-Length: 0` when the origin is not
in `corsWhitelist` — successful HTTP, empty body. The result: any tool that POSTs
through the proxy (e.g. `programRules/condition/description`, `programRuleActions/data/expression/description`,
or any custom app POSTing JSON to DHIS2) silently sees an empty response body and
appears to work. Stripping `Origin` makes DHIS2 treat it as a same-origin request
and return the full body.

Without this, a tool's GET-only flows look healthy but POST-based features silently
break in dev mode.

### 3. Inline `onclick` attribute couples HTML to a `window.*` global

**Files:** `src/index.html`, `src/app.js`

```diff
 # src/index.html
-<button onclick="helloWorld()">Hello</button>
+<button id="helloButton">Hello</button>
```

```diff
 # src/app.js
-window.helloWorld = async function () {
+async function helloWorld() {
     await testApi();
-    alert("Hello world...");
+    alert("Hello world...");
+}

-};
+document.addEventListener("DOMContentLoaded", () => {
+    document.getElementById("helloButton").addEventListener("click", helloWorld);
+});
```

The current pattern works, but it teaches every fork to ship the `window.*` global +
inline `onclick` idiom. In `tool-prv-validator` this pattern grew into three call
sites that referenced the function by its *DOM `onclick` attribute string* —
`document.querySelector("button[onclick='window.helloWorld()']")`. Renames break
silently. Fix it once in the template and everyone scaffolded from it inherits the
better pattern.

### 4. `webpack.config.js` calls `initialize()` without awaiting

**File:** `src/webpack.config.js`

```diff
-if (process.env.WEBPACK_SERVE) {
-    initialize();
-}
-
-module.exports = (env = {}) => {
+module.exports = async (env = {}) => {
     const isDevBuild = Boolean(env.WEBPACK_SERVE);
+    if (isDevBuild) {
+        await initialize();
+    }
     const webpackConfig = { ... };
     return webpackConfig;
 };
```

Webpack 5 supports `module.exports` returning a Promise. Awaiting `initialize()`
guarantees the dev-server proxy has the JSESSIONID cookie *before* the first
request arrives. As-is, the first few proxied requests log "No cookie found" until
the fetch resolves — harmless in most cases, but a real race if the user clicks
fast enough.

### 5. `Set-Cookie` parsed by splitting on commas

**File:** `src/webpack.config.js` — `fetchSessionCookie`

```diff
-const setCookieHeader = response.headers.get("set-cookie");
-if (setCookieHeader) {
-    const jsessionIdCookie = setCookieHeader.split(",").find(header => header.includes("JSESSIONID"));
-    if (jsessionIdCookie) {
-        cookie = jsessionIdCookie.split(";")[0];
-        console.log("JSESSIONID cookie successfully set:", cookie);
-    }
-}
+// Node 18+ undici: getSetCookie() returns one entry per Set-Cookie header.
+// Older fetch polyfills: fall back to headers.raw().
+const setCookieHeaders = response.headers.getSetCookie?.()
+    ?? (response.headers.raw?.() ?? {})["set-cookie"]
+    ?? [];
+const jsessionIdCookie = setCookieHeaders.find(h => h.includes("JSESSIONID"));
+if (jsessionIdCookie) {
+    cookie = jsessionIdCookie.split(";")[0];
+    console.log("JSESSIONID cookie successfully set:", cookie);
+}
```

`headers.get("set-cookie")` joins multiple Set-Cookie values with `, `. Cookie
values can legally contain commas (e.g. `Expires=Wed, 09 Jun 2026 ...`). Splitting
on `,` is brittle. The `onProxyRes` handler at the bottom of the proxy block
already does the right thing (`proxyRes.headers["set-cookie"]` is an array in
Node's HTTP API), so only `fetchSessionCookie` needs the change.

## Low-priority fixes

### 6. `parseServerVersion` only checks `minor`, and is NaN-unsafe

**File:** `src/js/check-header-bar.js`

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

```diff
-return versionInfo.minor < 42;
+return versionInfo.major < 2 || (versionInfo.major === 2 && versionInfo.minor < 42);
```

If DHIS2 ever cuts a 3.x line, `3.0.0` would have `minor = 0 < 42` and the legacy
header bar would re-load. And on garbage input, `parseInt("abc", 10) → NaN`, which
makes `NaN < 42` evaluate to `false` — *opposite* of the `catch` branch's
"unknown version → load legacy" behaviour. Both small, both worth fixing once.

### 7. `validateUID` ignores query strings

**File:** `src/js/d2api.js`

```diff
 const validateUID = (endpoint) => {
-    const uid = endpoint.split("/").pop();
+    const uid = endpoint.split("/").pop().split("?")[0];
     return /^[A-Za-z0-9]{11}$/.test(uid);
 };
```

If a caller passes `api/programRuleVariables/abc?merge=true`, the current code
warns spuriously even though the UID is valid. Drop the query string before
testing.

## Generic addition: optional Playwright test scaffold

**Suggestion only — not a bug fix.**

The template ships with no tests. Adding a `tests/playwright/` skeleton in the
template would mean every tool scaffolded from it starts with at least a smoke
test. The shape that worked here:

```
tests/playwright/
├── README.md
├── common.py        # BASE_URL, USER, PASSWD env-var lookup; get_session_cookie()
└── test_smoke.py    # opens dev server, asserts the page renders without
                    # console errors and that the /api/me endpoint resolves
                    # through the proxy.
```

`common.py` only needs:
```python
import json, os, urllib.request

BASE_URL = os.environ.get("DHIS2_BASE_URL", "http://localhost:8080/dhis")
USER = os.environ.get("DHIS2_USER", "admin")
PASSWD = os.environ.get("DHIS2_PASSWORD", "district")
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
    raise RuntimeError("No JSESSIONID returned from /api/auth/login")
```

Useful because the React-based DHIS2 login form is hostile to scripted form fills
— this `POST /api/auth/login` JSON path returns a session cookie that Playwright
can inject into its context. Documenting this once in the template saves every
downstream tool from rediscovering it.

If the team prefers JS over Python, `@playwright/test` is the equivalent and
arguably more idiomatic for a JS project. Pick one and document it in `AGENTS.md`.

## Checklist

A future PR against `tool-template` could land all of these in a single commit set:

- [ ] **HIGH** `src/js/d2api.js` — `baseUrl = isDev ? "" : "../../.."`.
- [ ] **HIGH** `src/webpack.config.js` — strip `Origin`/`Referer` in `onProxyReq`.
- [ ] **HIGH** `src/index.html` + `src/app.js` — replace inline `onclick` + `window.helloWorld` with `id` + `addEventListener`.
- [ ] **MEDIUM** `src/webpack.config.js` — `await initialize()` before resolving the config Promise.
- [ ] **MEDIUM** `src/webpack.config.js` — parse `Set-Cookie` via `getSetCookie()` / `headers.raw()`.
- [ ] **LOW** `src/js/check-header-bar.js` — robust `parseServerVersion` + major+minor comparison.
- [ ] **LOW** `src/js/d2api.js` — `validateUID` strips query string.
- [ ] **NICE-TO-HAVE** `tests/playwright/` skeleton with auth helper + smoke test.

Each one is small (mostly < 10 lines). Together they raise the floor of every
tool the template births.
