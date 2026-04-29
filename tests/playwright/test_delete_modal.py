"""Delete-confirm modal: opens with the right count, dismiss path fires no DELETE.

Run: python3 tests/playwright/test_delete_modal.py
"""
import sys
from playwright.sync_api import sync_playwright

from common import DEV_URL


def assert_eq(actual, expected, label):
    if actual != expected:
        print(f"FAIL: {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS: {label}: {actual!r}")


def main():
    console_msgs = []
    delete_calls = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context().new_page()
        page.on("console", lambda m: console_msgs.append((m.type, m.text)))
        page.on("request", lambda r: delete_calls.append(r.url) if r.method == "DELETE" else None)
        page.goto(DEV_URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_function("() => document.getElementById('programDropdown').options.length > 0", timeout=15000)
        page.wait_for_timeout(800)

        # Validate Malaria Foci to populate the unused-variables table.
        page.locator(".choices__inner").first.click(); page.wait_for_timeout(300)
        page.keyboard.type("Malaria Foci"); page.wait_for_timeout(700)
        page.locator(".choices__list--dropdown .choices__item--selectable", has_text="Malaria Foci").first.click()
        page.wait_for_timeout(200)
        page.locator("#validateSelectedButton").click()
        page.wait_for_function(
            "() => document.querySelector('.progress-container').style.display === 'none' && !document.getElementById('validateSelectedButton').disabled",
            timeout=120_000,
        )
        page.wait_for_timeout(500)

        # Switch to Unused tab, tick one row, click Delete selected.
        page.locator("ul.tabs li.tab a", has_text="UNUSED PROGRAM VARIABLES").first.click()
        page.wait_for_timeout(400)
        page.locator("#unusedVariablesTable .variable-checkbox").first.check(force=True)
        page.wait_for_timeout(200)
        page.locator("#deleteSelectedButton").click()
        page.wait_for_timeout(600)

        # Modal should be open with count "1".
        modal_open = page.evaluate("() => document.getElementById('deleteConfirmModal').classList.contains('open')")
        count_text = page.eval_on_selector("#deleteConfirmCount", "el => el.innerText")
        assert_eq(modal_open, True, "Delete modal open after click")
        assert_eq(count_text, "1", "Modal shows count of 1")

        # Click Cancel inside modal.
        page.locator("#deleteConfirmModal .modal-close.btn-flat").click()
        page.wait_for_timeout(800)
        assert_eq(page.evaluate("() => document.getElementById('deleteConfirmModal').classList.contains('open')"), False, "Modal closed after Cancel")
        assert_eq(len(delete_calls), 0, "No DELETE request fired on Cancel")

        # No console errors.
        errors = [m for t, m in console_msgs if t == "error"]
        assert_eq(errors, [], "No console errors")

        browser.close()
    print("\nAll delete-modal assertions PASSED")


if __name__ == "__main__":
    main()
