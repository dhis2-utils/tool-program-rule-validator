> [!WARNING]
> The suite creates and deletes metadata, deletes program rule variables through the app, and installs and uninstalls the app. Run it only against a throwaway DHIS2 instance that you can reset or create again. Never run it against a production server, a shared test server or a play server.

# End-to-end tests

The suite installs the built app on a DHIS2 instance and drives it in Chromium with Playwright. It follows the `e2e/run.sh` contract (version 1) in [TESTING.md](https://github.com/dhis2-utils/reference-tool-conventions/blob/main/TESTING.md) of reference-tool-conventions.

## What it tests

The suite seeds one event program, named `E2E tool-program-rule-validator <run id>`, with:

- one program rule variable for each way a rule can reference a variable, each used by one valid rule;
- two variables that no rule uses;
- one rule with an invalid condition and one with an invalid action.

It then checks that:

- the app loads, at the top level on 2.41 and earlier, and inside the global shell on 2.42 and later;
- the invalid condition and the invalid action are listed, and nothing else from the program;
- no used variable is listed as unused, for each reference style, and both unused variables are listed;
- ticked rows survive switching tabs;
- the delete confirmation lists the variables, and the backup download holds them;
- the app deletes an unused variable, and does not delete one that a rule started to use after the run;
- the Edit link opens the variable in Metadata Management or Maintenance;
- a run can be cancelled, and deleting is blocked on results from an earlier run;
- an expired session stops the run instead of listing rules as invalid;
- the page logs no unexpected HTTP errors or page errors.

## Get a throwaway instance

Start a local DHIS2 instance with a demo database, as described in [DHIS2 in Docker](https://developers.dhis2.org/docs/tutorials/dhis2-docker/). The suite runs on DHIS2 2.40 and later, with or without demo data.

## Run the suite

1. Install Python 3 and Playwright:

    ```bash
    pip install -r e2e/requirements.txt
    playwright install chromium
    ```

2. Build the app:

    ```bash
    pnpm install
    pnpm run build
    ```

3. Run the suite. Use a user with the `ALL` authority:

    ```bash
    mkdir -p /tmp/e2e-results
    DHIS2_URL=http://localhost:8080 DHIS2_USER=admin DHIS2_PASS=district \
    APP_ZIP=$PWD/build/bundle/tool-program-rule-validator-1.1.0.zip \
    RESULTS_DIR=/tmp/e2e-results LABEL=2.42 \
      e2e/run.sh
    ```

| Variable                   | Required | Meaning                                                                |
| -------------------------- | -------- | ---------------------------------------------------------------------- |
| `DHIS2_URL`                | yes      | Instance base URL                                                      |
| `DHIS2_USER`, `DHIS2_PASS` | yes      | A user with the `ALL` authority                                        |
| `APP_ZIP`                  | yes      | Absolute path of the built bundle                                      |
| `RESULTS_DIR`              | yes      | Existing directory for `results.json`, screenshots and the backup file |
| `LABEL`                    | no       | Prefix for screenshot names; default: the server version               |
| `APP_KEY`                  | no       | Default: the key the server reports for the installed app              |

The script writes `results.json` to `RESULTS_DIR`. It exits with `0` when every test passed, `1` when a test failed, and `2` when the suite could not run.

## Cleanup

Before it creates an object, the suite records it in the dataStore, at `e2e-state/tool-program-rule-validator`. At the end of the run it deletes the objects, the record and the app, whether the tests passed or failed. If a run is stopped before that, the next run deletes what the record lists before it seeds.

## Files

- `run.sh`: checks the environment and starts the suite.
- `suite.py`: installs the app, seeds, runs the tests, cleans up and writes `results.json`.
- `fixtures.py`: the seeded program, rules and variables.
- `state.py`: the dataStore record of what a run created.
- `dhis2_api.py`: the API client.
