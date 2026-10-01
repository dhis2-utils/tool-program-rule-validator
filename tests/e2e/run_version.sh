#!/usr/bin/env bash
# Install the built app bundle on an instance and run the e2e suite against it.
#
# Usage: DHIS2_URL=http://dhis2-agent-x:8080 LABEL=2.40 [KEEP_APP=1] ./run_version.sh
set -euo pipefail

DHIS2_URL=${DHIS2_URL:?set DHIS2_URL}
DHIS2_USER=${DHIS2_USER:-local_admin}
DHIS2_PASS=${DHIS2_PASS:-district}
LABEL=${LABEL:?set LABEL}
SCREENSHOT_DIR=${SCREENSHOT_DIR:-/tmp/prv-shots}
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

ZIP=$(ls "$REPO_ROOT"/build/bundle/tool-program-rule-validator-*.zip | head -1)
echo "Installing $ZIP on $DHIS2_URL ..."
code=$(curl -s -o /tmp/install-out.json -w "%{http_code}" -u "$DHIS2_USER:$DHIS2_PASS" \
    -F "file=@$ZIP" "$DHIS2_URL/api/apps")
if [[ "$code" != 2* ]]; then
    echo "App install failed: HTTP $code"; cat /tmp/install-out.json; exit 1
fi
echo "Installed (HTTP $code)"

set +e
DHIS2_URL="$DHIS2_URL" DHIS2_USER="$DHIS2_USER" DHIS2_PASS="$DHIS2_PASS" \
    LABEL="$LABEL" SCREENSHOT_DIR="$SCREENSHOT_DIR" \
    python3 "$REPO_ROOT/tests/e2e/test_prv_validator.py"
suite_rc=$?
set -e

if [[ "${KEEP_APP:-0}" != "1" ]]; then
    echo "Uninstalling app ..."
    curl -s -o /dev/null -w "uninstall -> %{http_code}\n" -u "$DHIS2_USER:$DHIS2_PASS" \
        -X DELETE "$DHIS2_URL/api/apps/tool-program-rule-validator"
fi
exit $suite_rc
