"""Smoke test: existing flows continue to work end to end.

Covers:
1. App loads, programs dropdown populated.
2. Validate Selected disabled with no selection.
3. Validate All enabled at idle.
4. Delete Selected disabled at idle.
5. Tab switching across all three result tabs.
6. Validate single program (Malaria Foci) → 2 unused PRVs.
7. Validate larger program (Animal Health) → 3 unused PRVs.
8. Invalid condition row rendering with an injected bad rule, including
   styled Maintenance button (className contains 'btn').
9. Select-all / Unselect-all / Single-row check enables Delete.
10. Filter by Programme.
11. No console errors / no failed requests / no 4xx API responses.

Run: python3 tests/playwright/test_smoke.py
"""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

from common import BASE_URL, DEV_URL, USER, PASSWD


def post(path, body, ctype="application/json"):
    headers = {"Content-Type": ctype}
    if ctype == "application/json":
        data = json.dumps(body).encode()
    else:
        data = body.encode() if isinstance(body, str) else body
    headers["Authorization"] = "Basic " + __import__("base64").b64encode(f"{USER}:{PASSWD}".encode()).decode()
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, method="POST", headers=headers)
    with urllib.request.urlopen(req) as r:
        return r.status, json.loads(r.read().decode())


def delete(path):
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        method="DELETE",
        headers={"Authorization": "Basic " + __import__("base64").b64encode(f"{USER}:{PASSWD}".encode()).decode()},
    )
    with urllib.request.urlopen(req) as r:
        return r.status


def assertEq(actual, expected, label):
    if actual != expected:
        print(f"FAIL: {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"PASS: {label}: {actual!r}")


def main():
    # Inject a temporary invalid rule on the small program so we can verify
    # the invalid-conditions tab and the Maintenance button styling.
    SMALL_PROG_ID = "M3xtLkYBlKI"  # Malaria Foci Investigation
    bad_rule_payload = {
        "name": "TEMP-PLAYWRIGHT-INVALID",
        "shortName": "TEMP-PLAYWRIGHT-INVALID",
        "program": {"id": SMALL_PROG_ID},
        "priority": 999,
        "condition": "this is *** definitely not valid syntax ***",
    }
    status, body = post("/api/programRules", bad_rule_payload)
    bad_rule_uid = body["response"]["uid"]
    print(f"Created temp invalid rule: {bad_rule_uid}")

    try:
        console_msgs = []
        page_errors = []
        failed_requests = []
        http_errors = []

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_context().new_page()
            page.on("console", lambda m: console_msgs.append((m.type, m.text)))
            page.on("pageerror", lambda e: page_errors.append(str(e)))
            page.on("requestfailed", lambda r: failed_requests.append((r.url, r.failure)))
            page.on("response", lambda r: http_errors.append((r.status, r.url)) if r.status >= 400 else None)

            page.goto(DEV_URL)
            page.wait_for_load_state("networkidle")
            page.wait_for_function("() => document.getElementById('programDropdown').options.length > 0", timeout=15000)
            page.wait_for_timeout(1000)

            # 1. Programs populated.
            options = page.eval_on_selector("#programDropdown", "el => el.options.length")
            assert options >= 1, f"expected ≥1 program option, got {options}"
            print(f"PASS: programs dropdown populated ({options} options)")

            # 2-4. Idle button states.
            assertEq(page.eval_on_selector("#validateSelectedButton", "el => el.disabled"), True, "Validate Selected disabled at idle")
            assertEq(page.eval_on_selector("#validateAllButton", "el => el.disabled"), False, "Validate All enabled at idle")
            assertEq(page.eval_on_selector("#deleteSelectedButton", "el => el.disabled"), True, "Delete Selected disabled at idle")

            # 5. Tab switching.
            for tab in ("INVALID ACTIONS", "UNUSED PROGRAM VARIABLES", "INVALID CONDITIONS"):
                page.locator("ul.tabs li.tab a", has_text=tab).first.click()
                page.wait_for_timeout(200)
            print("PASS: tab switching across all three tabs")

            # 6. Validate Malaria Foci.
            page.locator(".choices__inner").first.click(); page.wait_for_timeout(300)
            page.keyboard.type("Malaria Foci"); page.wait_for_timeout(700)
            page.locator(".choices__list--dropdown .choices__item--selectable", has_text="Malaria Foci").first.click()
            page.wait_for_timeout(300)
            page.locator("#validateSelectedButton").click()
            page.wait_for_function(
                "() => document.querySelector('.progress-container').style.display === 'none' && !document.getElementById('validateSelectedButton').disabled",
                timeout=120_000,
            )
            page.wait_for_timeout(500)
            unused = page.locator("#unusedVariablesTable tbody tr").count()
            assertEq(unused, 2, "Malaria Foci unused PRV count")

            # 8. Invalid condition row + Maintenance button has Materialize class.
            cond_rows = page.locator("#invalidConditionExpressionsTable tbody tr").count()
            assertEq(cond_rows, 1, "Invalid condition row from temp rule")
            btn_class = page.eval_on_selector("#invalidConditionExpressionsTable tbody tr button", "el => el.className")
            assert "btn" in btn_class, f"Maintenance button missing Materialize class: {btn_class!r}"
            print(f"PASS: Maintenance button has Materialize class ({btn_class!r})")

            # 9. Select-all / Unselect / Single ticks.
            page.locator("ul.tabs li.tab a", has_text="UNUSED PROGRAM VARIABLES").first.click(); page.wait_for_timeout(300)
            page.locator("#selectAllCheckbox").check(force=True)
            page.wait_for_timeout(200)
            assertEq(page.locator("#unusedVariablesTable .variable-checkbox:checked").count(), 2, "Select All ticks all rows")
            assertEq(page.eval_on_selector("#deleteSelectedButton", "el => el.disabled"), False, "Delete enabled after Select All")
            page.locator("#selectAllCheckbox").uncheck(force=True); page.wait_for_timeout(200)
            assertEq(page.eval_on_selector("#deleteSelectedButton", "el => el.disabled"), True, "Delete disabled after Unselect All")
            page.locator("#unusedVariablesTable .variable-checkbox").first.check(force=True); page.wait_for_timeout(200)
            assertEq(page.eval_on_selector("#deleteSelectedButton", "el => el.disabled"), False, "Delete enabled with one row ticked")
            page.locator("#unusedVariablesTable .variable-checkbox").first.uncheck(force=True)

            # 10. Filter by Programme.
            page.locator(".choices__inner").nth(1).click(); page.wait_for_timeout(300)
            page.keyboard.type("Malaria Foci"); page.wait_for_timeout(600)
            page.locator(".choices__list--dropdown .choices__item--selectable", has_text="Malaria Foci").first.click()
            page.wait_for_timeout(300)
            visible = page.locator("#unusedVariablesTable tbody tr:not([style*='display: none'])").count()
            assertEq(visible, 2, "Filter shows 2 rows (Malaria Foci only)")

            # 7. Validate Animal Health.
            page.reload()
            page.wait_for_load_state("networkidle")
            page.wait_for_function("() => document.getElementById('programDropdown').options.length > 0", timeout=15000)
            page.wait_for_timeout(800)
            page.locator(".choices__inner").first.click(); page.wait_for_timeout(300)
            page.keyboard.type("Animal Health"); page.wait_for_timeout(700)
            page.locator(".choices__list--dropdown .choices__item--selectable", has_text="Animal Health").first.click()
            page.wait_for_timeout(300)
            page.locator("#validateSelectedButton").click()
            page.wait_for_function(
                "() => document.querySelector('.progress-container').style.display === 'none' && !document.getElementById('validateSelectedButton').disabled",
                timeout=240_000,
            )
            page.wait_for_timeout(500)
            unused_animal = page.locator("#unusedVariablesTable tbody tr").count()
            assertEq(unused_animal, 3, "Animal Health unused PRV count")

            # 11. No errors throughout.
            errors = [m for t, m in console_msgs if t == "error"]
            api_4xx = [(s, u) for s, u in http_errors if "/api/" in u]
            assertEq(len(errors), 0, "No console errors")
            assertEq(len(page_errors), 0, "No page errors")
            assertEq(len(failed_requests), 0, "No failed requests")
            assertEq(len(api_4xx), 0, "No 4xx API responses")

            browser.close()
        print("\nAll smoke assertions PASSED")
    finally:
        delete(f"/api/programRules/{bad_rule_uid}")
        print(f"Cleaned up temp rule {bad_rule_uid}")


if __name__ == "__main__":
    main()
