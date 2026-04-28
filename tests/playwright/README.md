# Playwright UI tests

Three standalone Python scripts that exercise the app against the dev server.

## Prerequisites

- Python 3 with Playwright + Chromium:
  ```
  pip install playwright
  playwright install --with-deps chromium
  ```
- A running DHIS2 instance (defaults to `http://localhost:9021`, user `claude`,
  password `Test12345!`) and the app's dev server (`yarn start` on port 8081).

## Running

From the project root, with the dev server running:

```
python3 tests/playwright/test_smoke.py
python3 tests/playwright/test_cancel.py
python3 tests/playwright/test_delete_modal.py
```

Override defaults via env vars when needed:

```
DHIS2_BASE_URL=http://other-instance:8080 \
DHIS2_USER=admin \
DHIS2_PASSWORD=district \
DEV_URL=http://localhost:8081/ \
python3 tests/playwright/test_smoke.py
```

## What each test covers

- `test_smoke.py` — full app load, button states, tab switching, validate
  Malaria Foci + Animal Health, invalid-condition rendering with an injected
  bad rule (cleaned up at the end), select-all/single-row checkbox flows,
  Filter by Programme.
- `test_cancel.py` — click Validate All, click Cancel, assert the cancel
  button hides, progress hides, validate buttons re-enable, no AbortError
  leaks to the console.
- `test_delete_modal.py` — open the delete-confirm modal with one row
  ticked, dismiss via Cancel, assert no DELETE request fires.

## Notes

- These are standalone scripts, not pytest. They exit non-zero on the first
  failed assertion.
- `test_smoke.py` creates a temporary invalid program rule via the API and
  deletes it in a `finally` block — no DHIS2-side test data persists if the
  test crashes.
