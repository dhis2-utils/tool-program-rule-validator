> [!WARNING]
> This suite creates and deletes metadata, deletes a program rule variable through the tool, and installs and uninstalls the app. Run it only against a throwaway DHIS2 instance that you can reset or recreate. Never run it against a production, shared or play server.

# End-to-end tests

The suite installs the built bundle on a live DHIS2 instance and drives the app in Chromium. It follows the `e2e/run.sh` contract in [TESTING.md](https://github.com/dhis2-utils/reference-tool-conventions/blob/main/TESTING.md) of reference-tool-conventions. It is frame-aware: DHIS2 2.42 and later serve the app inside the global-shell iframe, 2.41 and earlier at the top level.

## What it checks

It seeds one event program, with names unique to the run, and then:

- validates the program and finds the rule with an invalid condition and the rule with an invalid action expression, and does not list the valid rule;
- lists the one unused variable, and none of the variables that rules use as `#{name}`, as a quoted argument to `d2:count`, inside the condition string of `d2:countIfCondition`, or in action content with apostrophes;
- deletes the unused variable through the confirm dialog, and checks through the API that it is gone and the used variables are not;
- answers every expression check with a 500 that carries `status: ERROR`, and checks that the tool reports "could not be validated" rather than listing invalid rules;
- slows the network down, starts **Validate all** and cancels it;
- fails on any unexpected HTTP error, console error or page error.

## Get a throwaway instance

Follow [DHIS2 in Docker](https://developers.dhis2.org/docs/tutorials/dhis2-docker/) on the developer portal. Either `d2 cluster` or the Docker Compose file in dhis2-core works. The instance needs at least one organisation unit, because DHIS2 enrolls a new event program at the root organisation unit. The demo databases have one; on an empty database, create one first.

## Run it

Prerequisites: Python 3, and Playwright for Python with Chromium.

```bash
pip install -r e2e/requirements.txt
python3 -m playwright install chromium
pnpm run build
mkdir -p /tmp/e2e-results
DHIS2_URL=http://localhost:8080 DHIS2_USER=admin DHIS2_PASS=district \
RESULTS_DIR=/tmp/e2e-results APP_ZIP="$(ls "$PWD"/build/bundle/*.zip)" \
  e2e/run.sh
```

`DHIS2_USER` must have the `ALL` authority. `LABEL` (default: the server version) prefixes the screenshot names. `APP_KEY` overrides the key, which by default is read from `/api/apps` after install.

The suite writes `results.json`, plus screenshots of each step and of every failure, to `RESULTS_DIR`. It exits `0` when all tests pass, `1` when a test fails, and `2` when it cannot run (bad credentials, failed install or seeding).

## Cleanup

Before it creates anything, the suite records the object's type and UID in the dataStore at `e2e-state/tool-program-rule-validator`. At the start of each run it deletes whatever that record still lists, so a run that was killed does not affect the next one. After a clean run the record is gone and the app is uninstalled.

## Files

- `run.sh`: the entry point; checks the inputs and starts the suite.
- `suite.py`: install, tests, cleanup and `results.json`.
- `fixtures.py`: seed data, and the dataStore record of what a run created.
- `dhis2_api.py`: a small DHIS2 API client on the Python standard library.
