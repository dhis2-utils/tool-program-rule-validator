# Dev container gaps observed while reviewing tool-prv-validator

This is a list of friction points the agent hit while bringing the test environment up. The goal is to bake these into the dev container so the next agent / developer can start testing immediately.

## What worked out of the box

- Node, yarn, and the project's own dependencies (`yarn install` had already been run).
- `curl`, `python3`, basic shell tools.
- `gh` was not needed for this task; not evaluated.
- `eslint` ran cleanly via `yarn lint`.

## Gaps, in time-cost order

### 1. Playwright was not pre-installed

Had to:

1. `pip install --break-system-packages playwright` (PEP 668 blocked plain `pip install`).
2. `python3 -m playwright install chromium` to fetch the browser binary.
3. `sudo PYTHONPATH=/home/agent/.local/lib/python3.12/site-packages /home/agent/.local/bin/playwright install-deps chromium` to install the missing system libraries (`libnss3`, `libatk1.0-0t64`, etc.). The straight `apt-get install` approach failed because Ubuntu 24.04 renamed several packages (`libcups2t64` → `libcups2`, `libpango-1.0-0` is not a valid name on Noble), so Playwright's own dep installer is the only reliable path.

**Fix**: pre-install Playwright + chromium + system libs in the container. One-liner during image build:

```
pip install --break-system-packages playwright \
  && playwright install --with-deps chromium
```

### 2. Python's "managed environment" lock blocks `pip install`

PEP 668 / `EXTERNALLY-MANAGED` on Ubuntu 24.04 means a default `pip install` errors out. `--break-system-packages` works but is noisy.

**Fix**: provision a venv at a known path (e.g. `/opt/agent-venv`) with Playwright pre-installed and `PATH` updated, or set `PIP_BREAK_SYSTEM_PACKAGES=1` in the container env if the agent is expected to install Python packages ad-hoc.

### 3. `d2auth.json` was not pointed at the dev DHIS2 instance

The committed `d2auth.json` pointed at `http://localhost:9595/slt10` (a different instance), not the `localhost:9021` instance the agent was told to use. Easy to edit, but a 30-second detour every time.

**Fix**: either

- ship a `d2auth.json` in the container that already matches the running instance, or
- have the dev server read from environment variables (`DHIS2_BASE_URL`, `DHIS2_USERNAME`, `DHIS2_PASSWORD`) with a sensible fallback to `d2auth.json`. The latter is more robust across instances/users.

### 4. The DHIS2 instance's `corsWhitelist` did not include the dev-server origin

The dev server runs at `:8081`, but the DHIS2 server's `corsWhitelist` only allowed `:3000`. As a result, the dev-server build hit CORS errors and the app appeared completely broken until the allowlist was extended via:

```
PUT /api/configuration/corsWhitelist
```

This is partly a project bug (see `REVIEW-FINDINGS.md` finding #1) and partly a container-provisioning gap.

**Fix**: when the DHIS2 dev instance is started, seed `corsWhitelist` with `http://localhost:8081` (and any other ports your tools use). One `curl` call as part of instance bring-up.

### 5. The DHIS2 login form is a React SPA — the obvious Playwright path fails

Trying to fill `input[name="username"]` and click submit on `/dhis-web-login/` did not authenticate (the form is React-rendered and submission goes through internal handlers). The agent had to discover that `POST /api/auth/login` with JSON body returns a JSESSIONID cookie that can be injected into Playwright's context.

**Fix**: document the JSON-login pattern in a small helper script that's part of the container's tooling, e.g. `dhis2-login.py` that takes `(base_url, user, pass)` and returns a cookie name+value. The next agent can `from dhis2_login import get_session_cookie` instead of rediscovering the path.

### 6. The dev server proxy did not actually work — only revealed by a CORS error

This is the project bug from #4 above, but it cost the agent ~5 minutes of "why is the dropdown empty" investigation. The combination of (a) a proxy that looks correct in `webpack.config.js`, (b) a `d2api.js` that bypasses it, and (c) silent CORS failures in the browser, made it look like a setup problem rather than an app bug.

**Fix**: either fix the app (see `REVIEW-FINDINGS.md`) or document loudly in the README that the DHIS2 instance must allowlist `http://localhost:8081`.

### 7. `webapp-testing` skill assumes Playwright is ready

The `/webapp-testing` skill jumps straight to "write a Playwright script". Hitting #1 required the agent to interrupt the flow and bootstrap. The skill could include a one-line `which python3 && python3 -c "import playwright" || ...` self-check so it surfaces the gap before the agent commits to a plan.

### 8. No `.gitignore` entry for `.DS_Store`

Already noted as a code finding, but worth repeating: any agent committing on a macOS host (or running in a container that mounts a macOS host) will keep adding these. `**/.DS_Store` in `.gitignore` is one line.

## Suggested container `Dockerfile` snippet

```dockerfile
# Playwright + chromium + system deps, ready for any agent that needs it
ENV PIP_BREAK_SYSTEM_PACKAGES=1
RUN pip install playwright \
 && playwright install --with-deps chromium

# DHIS2 instance helper: a small library the webapp-testing skill (or any agent) can import
COPY tools/dhis2_login.py /usr/local/lib/python3.12/site-packages/dhis2_login.py
```

And one-shot post-start commands for the DHIS2 instance:

```bash
# Seed CORS allowlist for known dev ports
curl -u "$DHIS2_USER:$DHIS2_PASS" -X POST -H "Content-Type: application/json" \
  "$DHIS2_URL/api/configuration/corsWhitelist" \
  -d '["http://localhost:3000","http://localhost:8081","http://localhost:8080"]'
```

## Total time lost to gaps

Rough estimate based on the session: ~5 minutes installing Playwright + chromium + system libs, ~2 minutes diagnosing the CORS / proxy mismatch, ~2 minutes discovering the JSON-login pattern. ~10 minutes of the ~30-minute review was spent on environment bring-up that could be eliminated.
