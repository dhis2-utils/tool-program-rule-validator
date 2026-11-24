#!/usr/bin/env bash
# Run the end-to-end suite against one DHIS2 instance (TESTING.md contract v1).
#
# WARNING: the suite creates and deletes metadata and installs and uninstalls
# the app. Run it only against a throwaway instance.
#
#   DHIS2_URL=http://localhost:8080 DHIS2_USER=admin DHIS2_PASS=district \
#   APP_ZIP=$PWD/build/bundle/tool-program-rule-validator-1.1.0.zip \
#   RESULTS_DIR=/tmp/e2e-results LABEL=2.42 e2e/run.sh
#
# Exit codes: 0 all tests passed, 1 a test failed, 2 the suite could not run.
set -uo pipefail

missing=()
for var in DHIS2_URL DHIS2_USER DHIS2_PASS APP_ZIP RESULTS_DIR; do
    [[ -n "${!var:-}" ]] || missing+=("$var")
done
if (( ${#missing[@]} > 0 )); then
    echo "Set ${missing[*]}. There are no defaults; see e2e/README.md." >&2
    exit 2
fi
if [[ ! -f "$APP_ZIP" ]]; then
    echo "APP_ZIP is not a file: $APP_ZIP" >&2
    exit 2
fi
if [[ ! -d "$RESULTS_DIR" ]]; then
    echo "RESULTS_DIR is not a directory: $RESULTS_DIR" >&2
    exit 2
fi

export DHIS2_URL="${DHIS2_URL%/}"
exec python3 "$(cd "$(dirname "$0")" && pwd)/suite.py"
