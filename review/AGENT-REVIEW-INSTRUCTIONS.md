# Reviewing a DHIS2 web app — agent playbook

Use this as the prompt scaffold when asking an agent to review a DHIS2 webapp like `tool-prv-validator`. It assumes the agent has shell + Read/Write/Edit + Playwright access and is given:

- a path to the project (`PROJECT_DIR`)
- one or more DHIS2 instance URLs (`DHIS2_URL_1`, `DHIS2_URL_2`, …) with credentials
- an explicit scope: "code review + UI test", "UI test only", or "regression check on a specific feature"

## Mental model

DHIS2 webapps come in two shapes:

- **App-Platform apps** (React + `@dhis2/app-runtime`) — modern, served via `d2 app:scripts start`, talk to DHIS2 through `useDataQuery` / `useDataMutation`.
- **Legacy / vanilla apps** (the kind `tool-prv-validator` is) — webpack-bundled, hand-rolled fetch wrapper, served via `webpack-dev-server` with a proxy to a configured DHIS2 instance.

The two are tested differently:

- App-Platform apps: the dev server is same-origin and authenticated via `d2 app:scripts start`'s proxy. CORS is rarely an issue.
- Legacy apps: dev mode often makes cross-origin calls and needs the DHIS2 `corsWhitelist` extended. Always verify the dev server actually returns data before going further.

Detect which shape you're looking at:

```
ls "$PROJECT_DIR/d2.config.js" 2>/dev/null && echo "App Platform" || echo "Legacy"
```

`d2.config.js` is the App-Platform marker; `webpack.config.js` + `manifest.webapp` without it is legacy.

## Standard workflow

1. **Read context** — `README.md`, `MANUAL.md`, `package.json`, `manifest.webapp`. Identify the app's purpose, what data it reads, what it mutates. Mutations matter: for any DELETE/PUT/POST endpoint, plan how you'll test without destroying real data.
2. **Static review** — read every file under `src/`. Note the API surface used. Check `eslint`/`tsc` baseline.
3. **Set up dev mode** — see [Setup checklist](#setup-checklist) below. Verify the dev server returns data before writing any test.
4. **UI tests** — use Playwright. See [Playwright patterns](#playwright-patterns).
5. **Multi-instance pass** — see [Testing across DHIS2 versions](#testing-across-dhis2-versions).
6. **Cleanup** — see [Cleanup discipline](#cleanup-discipline).
7. **Report** — three documents: findings (severity-ranked), changes left behind, environment gaps.

## Setup checklist

For a legacy app (adapt for App Platform):

```
# 1. Point auth at the target instance
cat > "$PROJECT_DIR/d2auth.json" <<EOF
{ "baseUrl": "$DHIS2_URL", "username": "$DHIS2_USER", "password": "$DHIS2_PASS" }
EOF

# 2. Seed CORS allowlist (legacy apps usually need this)
curl -s -u "$DHIS2_USER:$DHIS2_PASS" "$DHIS2_URL/api/configuration/corsWhitelist" \
  | jq '. + ["http://localhost:8081"] | unique'  # then PUT it back

# 3. Start dev server (background)
yarn start &> /tmp/dev.log &
# Wait for "compiled successfully"

# 4. Smoke check — does the app actually load data?
# Use Playwright probe before committing to a full test suite. If the dropdown is
# empty or any fetch returns 4xx/CORS errors, fix that first.
```

If the dev server proxy is misconfigured (a real bug we hit), the app will load HTML but no API data. Always assert that *some* known data appears (program count, org-unit count, etc.) in your first probe.

## Playwright patterns

### Authentication: skip the login form

DHIS2's React-based login form does not respond reliably to scripted form-fills. Do this instead:

```python
import json, urllib.request

def get_session_cookie(base_url, user, password):
    req = urllib.request.Request(
        f"{base_url}/api/auth/login",
        data=json.dumps({"username": user, "password": password}).encode(),
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

# Then in Playwright:
# ctx.add_cookies([{"name": cn, "value": cv, "domain": "localhost", "path": "/", ...}])
```

Cookie name varies per instance (e.g. `JSESSIONID`, `JSESSIONID_hmis_trk`). Match on the substring `JSESSIONID`.

### Recon-then-act, always

Don't write a 200-line script and run it once. Run a probe first that prints the DOM state, frame structure, console errors, and HTTP error responses. Adjust selectors, then write the full test. Common surprises:

- The app may run inside an iframe under the DHIS2 app shell. Check `page.frames`.
- Choices.js / similar wrappers hide the underlying `<select>`. Use `state="attached"` and locate the wrapper (`.choices__inner`, etc.).
- Materialize wraps checkboxes in a `<span>` overlay that blocks clicks. Use `.check(force=True)`.
- DHIS2 returns 200 with `{"status":"ERROR"}` for invalid expressions. HTTP-status checks miss this — inspect the response body.

### Always capture all four event streams

```python
page.on("console", lambda m: console.append((m.type, m.text)))
page.on("pageerror", lambda e: errors.append(str(e)))
page.on("requestfailed", lambda r: failed.append((r.url, r.failure)))
page.on("response", lambda r: http_errors.append((r.status, r.url)) if r.status >= 400 else None)
```

A test that "passes" but logged 12 console errors is not a passing test.

### Wait on app state, not on time

Long-running validations / reports can take minutes. Don't hard-code `wait_for_timeout(30000)` — wait on a deterministic DOM signal:

```python
page.wait_for_function(
    "() => document.querySelector('.progress-container').style.display === 'none' "
    "&& !document.getElementById('runButton').disabled",
    timeout=240_000,
)
```

## Testing across DHIS2 versions

Most real bugs in DHIS2 apps come from version drift: an endpoint that worked in 2.40 changes shape in 2.42, a UI auth flow changes, a system setting key gets renamed (`keyCorsWhitelist` → `corsWhitelist` was an example we hit on 2.42.4).

When given multiple instance URLs, run the same Playwright suite against each and diff the results. Structure:

```
DHIS2_INSTANCES = [
    {"url": "http://dhis-2.40", "user": "admin", "pass": "district", "label": "2.40"},
    {"url": "http://dhis-2.41", "user": "admin", "pass": "district", "label": "2.41"},
    {"url": "http://dhis-2.42", "user": "claude", "pass": "Test12345!", "label": "2.42"},
]

for inst in DHIS2_INSTANCES:
    # 1. Repoint d2auth.json (or env vars) at this instance
    # 2. Restart dev server
    # 3. Run the Playwright suite, tagging each result with inst["label"]
    # 4. Persist screenshots to /tmp/<label>-step-N.png
```

Things to actively diff across versions:

- `GET /api/system/info` → `version`. Confirm the app's version-dependent code paths (e.g. `check-header-bar.js`'s `versionInfo.minor < 42`) trigger correctly on each.
- API field shapes. For each endpoint the app calls, hit it manually on each instance and confirm the response shape matches what the app expects. A `programRules?fields=name,id,condition,programRuleActions[data,content,description]` query on a 2.40 instance may return slightly different action shapes than 2.42.
- Auth differences: token vs session cookie endpoints, CORS allowlist API path, login form structure. The cookie name, login JSON shape, and CSRF requirements have all changed across the 2.39 → 2.42 line.
- UI shell differences: the legacy header bar vs `@dhis2/header-bar` vs the modern app shell with iframe wrapping. Frame structure in Playwright will differ.
- System-setting keys. Many were renamed; if the app reads or writes `systemSettings`, run `GET /api/systemSettings.json` on each version and verify the keys it expects exist.

Keep a single results table with one column per instance and one row per test step:

| Step | 2.40 | 2.41 | 2.42 |
|---|---|---|---|
| App loads | PASS | PASS | PASS |
| Programs dropdown populated | PASS (28) | PASS (28) | PASS (28) |
| Validate single program | PASS | FAIL: 4xx on `/api/programRules/condition/description` | PASS |
| Invalid-condition tab populates | PASS | n/a | PASS |

Failures that occur on only one version are far more interesting than uniform passes — flag them prominently in the report.

## Cleanup discipline

Any test data you create must be deleted before reporting. Track every mutation:

```python
created_uids = []  # append every uid you POST
# ... at end of test, regardless of pass/fail:
for uid in created_uids:
    requests.delete(f"{base}/api/programRules/{uid}", auth=...)
```

Also revert any system-setting changes (CORS allowlist edits, feature flags). If you can't safely revert, surface this in the report:

> The CORS allowlist was extended from `[X]` to `[X, http://localhost:8081]`. Required for testing; revert if not desired.

If you installed and uninstalled an app via `POST /api/apps`, confirm uninstall returned 204.

If you switched a config file (`d2auth.json`, `.env`) for testing, decide whether to revert. Either revert to the prior content (preferred if you saved it) or call it out clearly in the report.

## Report structure

Three documents per review:

1. **`REVIEW-FINDINGS.md`** — severity-ranked list of code/UX/architecture issues, each with `file_path:line_number` references and a concrete fix suggestion.
2. **`UI-TEST-RESULTS.md`** — one row per flow tested, status per DHIS2 version if multi-instance. Embed screenshots inline.
3. **`STATE-CHANGES.md`** — every persistent change made (auth files, system settings, test data created/deleted). Mark which were reverted and which were left in place.

Severity tiers:

- **HIGH**: bug, security issue, or architectural mistake that affects correctness, can lose data, or makes the app unusable in some configuration.
- **MEDIUM**: UX inconsistency, performance issue, missing cancel/abort path, code that works but is fragile.
- **LOW**: cosmetic, dead code, typos, missing `.gitignore` entries.

Don't pad the list. A 5-finding report with concrete fixes is more useful than a 30-finding report mixing real bugs with style nits.

## Scope discipline

- A bug fix is *not* an excuse to refactor the surrounding code. If asked to "review", do not also implement.
- If the user asks for testing only, write tests and report. Do not edit the app.
- If the user asks for a fix to a specific finding, fix only that one and ask before bundling other findings into the same change.

## What to do when blocked

- Empty dropdown / no data after dev-server start → check console for CORS errors first, then check `d2auth.json`, then check that the dev server proxy code is actually reachable. (See `REVIEW-FINDINGS.md` finding #1 for the legacy-app trap.)
- Login form fill not authenticating → switch to `POST /api/auth/login` and inject the session cookie.
- Playwright `BrowserType.launch` fails with "Host system is missing dependencies" → run `sudo $(which playwright) install-deps chromium`. Plain `apt-get install` won't work on Ubuntu 24.04 because of `t64` package renames.
- Selector returns 0 results but element is visibly present → likely an iframe (`page.frames`) or hidden by a wrapper widget (Choices.js, Materialize). Use `state="attached"` and locate the wrapping element.
- Validation appears to hang → check whether the app has a sequential per-program loop (common in legacy code) and the instance is large. Wait on a deterministic DOM signal, not a fixed timeout.

## One-shot smoke probe template

Drop this in `/tmp/probe.py` for any new app to figure out the lay of the land before writing real tests:

```python
import json, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:9021"
DEV = "http://localhost:8081/"
USER, PASS = "claude", "Test12345!"

def login_cookie():
    req = urllib.request.Request(
        f"{BASE}/api/auth/login",
        data=json.dumps({"username": USER, "password": PASS}).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req) as r:
        for c in r.headers.get_all("Set-Cookie") or []:
            head = c.split(";", 1)[0]
            n, _, v = head.partition("=")
            if "JSESSIONID" in n:
                return n.strip(), v.strip()

console, errors, failed, http_err = [], [], [], []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context()
    cn, cv = login_cookie()
    ctx.add_cookies([{"name": cn, "value": cv, "domain": "localhost", "path": "/", "httpOnly": True, "sameSite": "Lax"}])
    page = ctx.new_page()
    page.on("console", lambda m: console.append((m.type, m.text)))
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("requestfailed", lambda r: failed.append((r.url, r.failure)))
    page.on("response", lambda r: http_err.append((r.status, r.url)) if r.status >= 400 else None)
    page.goto(DEV); page.wait_for_load_state("networkidle"); page.wait_for_timeout(2500)
    page.screenshot(path="/tmp/probe.png", full_page=True)
    print("URL:", page.url)
    print("Frames:", [f.url for f in page.frames])
    print("Console errors:", [m for t,m in console if t=="error"][:5])
    print("Page errors:", errors[:3])
    print("Failed requests:", failed[:5])
    print("HTTP >=400:", http_err[:5])
    b.close()
```

Run it. Read the output. Plan the real test from what you actually see.
