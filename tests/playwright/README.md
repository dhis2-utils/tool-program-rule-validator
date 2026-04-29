# Playwright UI tests

Three standalone Python scripts that exercise the app against the dev server.

## Prerequisites

- Python 3 with Playwright + Chromium:
  ```
  pip install playwright
  playwright install --with-deps chromium
  ```
- A running DHIS2 instance and the app's dev server (`yarn start` on port 8081).
- Three required environment variables: `DHIS2_BASE_URL`, `DHIS2_USER`,
  `DHIS2_PASSWORD`. `DEV_URL` is optional (defaults to `http://localhost:8081/`).

## Running

From the project root, with the dev server running:

```
DHIS2_BASE_URL=http://localhost:8080/dhis \
DHIS2_USER=admin \
DHIS2_PASSWORD=district \
python3 tests/playwright/test_smoke.py
```

The same variables apply to `test_cancel.py` and `test_delete_modal.py`.

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
