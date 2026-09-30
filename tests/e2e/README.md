# End-to-end tests

Playwright suite that installs the built app bundle on a live DHIS2 instance and
drives the full flow: program selection, validation, invalid-condition /
invalid-action / unused-variable detection, UI deletion with the confirm modal,
API-verified deletion, and run cancellation. It is frame-aware, so it works both
on ≤2.41 (app served at top level) and 2.42+ (app served inside the global-shell
iframe).

The suite doubles as the acceptance suite for the App Platform migration: the
same flows pass on DHIS2 2.40, 2.41, 2.42 and 2.43.

## Prerequisites

- A reachable DHIS2 instance and credentials (a superuser).
- A built bundle: `pnpm build` (produces `build/bundle/tool-pr-validator-*.zip`).
- Python Playwright: `pip install playwright && playwright install chromium`.

## Run against one instance

```bash
DHIS2_URL=http://your-dhis2:8080 \
DHIS2_USER=admin DHIS2_PASS=district \
LABEL=2.43 SCREENSHOT_DIR=/tmp/prv-shots \
./run_version.sh
```

`run_version.sh` installs the bundle via `POST /api/apps`, runs the suite, and
uninstalls it afterwards (set `KEEP_APP=1` to leave it installed). The suite
seeds a throwaway program with rules/variables (`fixtures.py`) and deletes them
at the end, regardless of pass/fail.

## Files

- `dhis2_helpers.py` — Basic-auth API client and session-cookie helper.
- `fixtures.py` — seed/cleanup of the throwaway test program and its rules/PRVs.
- `test_prv_validator.py` — the suite; each step prints PASS/FAIL/SKIP.
- `run_version.sh` — install bundle → run suite → uninstall.

Exit code is non-zero if any step FAILs.
