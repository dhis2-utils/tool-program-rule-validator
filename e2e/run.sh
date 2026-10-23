#!/usr/bin/env bash
# End-to-end suite entry point (contract: reference-tool-conventions TESTING.md).
#
# Installs APP_ZIP on DHIS2_URL, seeds a throwaway program, drives the app in
# Chromium, cleans up, uninstalls the app and writes $RESULTS_DIR/results.json.
#
# The suite changes and deletes data. Run it only against a throwaway instance.
#
#   DHIS2_URL=http://localhost:8080 DHIS2_USER=admin DHIS2_PASS=district \
#   RESULTS_DIR=/tmp/out APP_ZIP=$PWD/build/bundle/tool-program-rule-validator-1.0.1.zip \
#     e2e/run.sh
#
# Exit codes: 0 all tests passed, 1 a test failed, 2 the suite could not run.
set -uo pipefail

missing=()
for var in DHIS2_URL DHIS2_USER DHIS2_PASS APP_ZIP RESULTS_DIR; do
    [[ -n "${!var:-}" ]] || missing+=("$var")
done
if (( ${#missing[@]} > 0 )); then
    echo "Missing required environment variables: ${missing[*]}" >&2
    exit 2
fi
if [[ ! -f "$APP_ZIP" ]]; then
    echo "APP_ZIP does not exist: $APP_ZIP" >&2
    exit 2
fi
if [[ ! -d "$RESULTS_DIR" ]]; then
    echo "RESULTS_DIR is not an existing directory: $RESULTS_DIR" >&2
    exit 2
fi

exec python3 -u "$(cd "$(dirname "$0")" && pwd)/suite.py"
