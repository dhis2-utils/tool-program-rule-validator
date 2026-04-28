"""Cancel button: starts Validate All, clicks Cancel, asserts the
state machine resets cleanly and no AbortError is logged.

Run: python3 tests/playwright/test_cancel.py
"""
import sys
from playwright.sync_api import sync_playwright

from common import DEV_URL


def assertEq(actual, expected, label):
    if actual != expected:
        print(f"FAIL: {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS: {label}: {actual!r}")


def main():
    console_msgs = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context().new_page()
        page.on("console", lambda m: console_msgs.append((m.type, m.text)))
        page.goto(DEV_URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_function("() => document.getElementById('programDropdown').options.length > 0", timeout=15000)
        page.wait_for_timeout(800)

        # Idle: cancel button hidden.
        assertEq(page.eval_on_selector("#cancelButton", "el => el.style.display"), "none", "Cancel hidden at idle")

        # Start a Validate All. The cancel button should appear.
        page.locator("#validateAllButton").click()
        page.wait_for_function(
            "() => document.getElementById('cancelButton').style.display !== 'none'",
            timeout=5000,
        )
        print("PASS: Cancel button shown when Validate All starts")

        # Click cancel.
        page.locator("#cancelButton").click()
        page.wait_for_function(
            "() => document.querySelector('.progress-container').style.display === 'none' && !document.getElementById('validateSelectedButton').disabled",
            timeout=15000,
        )
        page.wait_for_timeout(400)

        assertEq(page.eval_on_selector("#cancelButton", "el => el.style.display"), "none", "Cancel hidden after click")
        assertEq(page.eval_on_selector(".progress-container", "el => el.style.display"), "none", "Progress hidden after cancel")
        assertEq(page.eval_on_selector("#validateAllButton", "el => el.disabled"), False, "Validate All re-enabled after cancel")

        # No AbortError should leak to the console.
        bad = [m for t, m in console_msgs if t == "error" and ("AbortError" in m or "Validation failed" in m)]
        assertEq(bad, [], "No AbortError / 'Validation failed' messages in console")

        browser.close()
    print("\nAll cancel assertions PASSED")


if __name__ == "__main__":
    main()
