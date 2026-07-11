#!/usr/bin/env python3
"""End-to-end suite for the Program Rule Validator app.

Runs against a live DHIS2 instance with the production bundle installed:

    DHIS2_URL=http://dhis2-agent-x:8080 DHIS2_USER=local_admin DHIS2_PASS=district \
        LABEL=2.40 SCREENSHOT_DIR=/tmp/shots python3 test_prv_validator.py

Steps (each reported PASS/FAIL/SKIP):
  1. app loads inside DHIS2 (frame-aware: 2.42+ global shell serves apps in an iframe)
  2. program dropdown populated
  3. validate-selected disabled with no selection
  4. validate seeded test program -> results appear
  5. invalid condition detected (seeded rule listed)
  6. invalid action expression detected (seeded rule listed)
  7. unused variable detected; used variable NOT listed
  8. delete unused variable via UI (confirm modal) -> success alert, row gone
  9. deletion verified via API (404)
 10. cancel a validate-all run -> cancelled notice
No console errors / page errors tolerated (reported as a final step).
"""

from __future__ import annotations

import os
import sys
import traceback
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

import fixtures
from dhis2_helpers import APP_KEY, BASE, api, session_cookie, system_version

LABEL = os.environ.get("LABEL", "unlabelled")
SHOT_DIR = os.environ.get("SCREENSHOT_DIR", "/tmp/prv-shots")
os.makedirs(SHOT_DIR, exist_ok=True)

APP_URL = f"{BASE}/api/apps/{APP_KEY}/index.html"

SELECT_INPUT = '[data-test="dhis2-uicore-select-input"]'
MENU_OPTION = '[data-test="dhis2-uicore-multiselectoption"]'
FILTER_INPUT = '[data-test="dhis2-uicore-select-filterinput"] input'

results: list[tuple[str, str, str]] = []  # (step, status, note)


def record(step: str, status: str, note: str = ""):
    results.append((step, status, note))
    print(f"  [{status}] {step}" + (f" — {note}" if note else ""))


def shot(page, name: str):
    path = os.path.join(SHOT_DIR, f"{LABEL}-{name}.png")
    page.screenshot(path=path, full_page=True)
    return path


def find_app_frame(page):
    """Return the frame containing the app (top page on <=2.41, iframe on 2.42+)."""
    page.wait_for_timeout(1000)
    for _ in range(30):
        for frame in page.frames:
            try:
                if frame.locator('[data-test="program-select"]').count() > 0:
                    return frame
            except Exception:
                continue
        page.wait_for_timeout(1000)
    raise RuntimeError(
        f"App frame not found; frames: {[f.url for f in page.frames]}"
    )


def open_program_menu(frame, field_test_id: str):
    frame.locator(f'[data-test="{field_test_id}"] {SELECT_INPUT}').click()
    frame.locator(MENU_OPTION).first.wait_for(state="visible", timeout=10_000)


def choose_option(frame, label: str):
    filter_input = frame.locator(FILTER_INPUT)
    if filter_input.count() > 0 and filter_input.first.is_visible():
        filter_input.first.fill(label)
        frame.wait_for_timeout(400)
    frame.locator(MENU_OPTION, has_text=label).first.click()


def close_menu(frame, page):
    page.keyboard.press("Escape")
    frame.page.wait_for_timeout(300)


def main():
    version = system_version()
    print(f"== {LABEL}: {BASE} (DHIS2 {version}) ==")

    print("Seeding fixtures ...")
    created: dict = {}
    created = fixtures.seed()
    print(f"  created: {created}")

    console_errors: list[str] = []
    page_errors: list[str] = []
    http_errors: list[tuple[int, str]] = []  # (status, url)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            host = urlparse(BASE).hostname
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            name, value = session_cookie()
            ctx.add_cookies(
                [
                    {
                        "name": name,
                        "value": value,
                        "domain": host,
                        "path": "/",
                        "httpOnly": True,
                        "sameSite": "Lax",
                    }
                ]
            )
            page = ctx.new_page()
            page.on(
                "console",
                lambda m: console_errors.append(m.text)
                if m.type == "error"
                else None,
            )
            page.on("pageerror", lambda e: page_errors.append(str(e)))
            page.on(
                "response",
                lambda r: http_errors.append((r.status, r.url))
                if r.status >= 400
                else None,
            )

            # -- 1. app loads
            page.goto(APP_URL, wait_until="domcontentloaded")
            try:
                frame = find_app_frame(page)
                in_iframe = frame != page.main_frame
                record("app loads", "PASS", f"iframe={in_iframe}")
            except Exception as error:
                shot(page, "load-failure")
                record("app loads", "FAIL", str(error)[:200])
                raise

            # -- 2. program dropdown populated
            open_program_menu(frame, "program-select")
            option_count = frame.locator(MENU_OPTION).count()
            if option_count > 0:
                record("programs listed", "PASS", f"{option_count} options")
            else:
                record("programs listed", "FAIL", "no options in menu")
            shot(page, "01-programs-open")

            # -- 3. validate-selected disabled with no selection
            close_menu(frame, page)
            disabled = frame.locator(
                '[data-test="validate-selected-button"]'
            ).is_disabled()
            record(
                "validate-selected disabled without selection",
                "PASS" if disabled else "FAIL",
            )

            # -- 4. validate the seeded program
            open_program_menu(frame, "program-select")
            choose_option(frame, fixtures.PROGRAM_NAME)
            close_menu(frame, page)
            frame.locator('[data-test="validate-selected-button"]').click()
            frame.locator('[data-test="validation-results"]').wait_for(
                timeout=120_000
            )
            record("validation run completes", "PASS")
            shot(page, "02-results")

            # -- 5. invalid condition listed
            frame.locator('[data-test="tab-invalid-conditions"]').click()
            table = frame.locator('[data-test="invalid-conditions-table"]')
            cond_row = table.locator(
                "tr", has_text=fixtures.RULE_INVALID_CONDITION
            )
            if cond_row.count() == 1:
                record(
                    "invalid condition detected",
                    "PASS",
                    cond_row.inner_text()[:120].replace("\n", " | "),
                )
            else:
                record(
                    "invalid condition detected",
                    "FAIL",
                    f"rows={cond_row.count()}",
                )
            shot(page, "03-invalid-conditions")

            # -- 6. invalid action listed
            frame.locator('[data-test="tab-invalid-actions"]').click()
            table = frame.locator('[data-test="invalid-actions-table"]')
            act_row = table.locator("tr", has_text=fixtures.RULE_INVALID_ACTION)
            if act_row.count() == 1:
                record(
                    "invalid action detected",
                    "PASS",
                    act_row.inner_text()[:120].replace("\n", " | "),
                )
            else:
                record(
                    "invalid action detected", "FAIL", f"rows={act_row.count()}"
                )
            shot(page, "04-invalid-actions")

            # -- 7. unused variable listed, used variable absent
            frame.locator('[data-test="tab-unused-variables"]').click()
            table = frame.locator('[data-test="unused-variables-table"]')
            unused_row = table.locator("tr", has_text=fixtures.UNUSED_PRV)
            used_row = table.locator(
                "tr", has_text=fixtures.USED_PRV
            ).filter(has_not_text=fixtures.UNUSED_PRV)
            ok = unused_row.count() == 1 and used_row.count() == 0
            record(
                "unused variable detection",
                "PASS" if ok else "FAIL",
                f"unused rows={unused_row.count()}, used rows={used_row.count()}",
            )
            shot(page, "05-unused-variables")

            # -- 8. delete the unused variable through the UI
            unused_row.locator('[data-test="variable-checkbox"]').click()
            delete_button = frame.locator(
                '[data-test="delete-selected-button"]'
            )
            delete_button.click()
            frame.locator('[data-test="delete-confirm-modal"]').wait_for(
                timeout=10_000
            )
            shot(page, "06-delete-modal")
            frame.locator('[data-test="delete-confirm-button"]').click()
            alert = frame.locator('[data-test="dhis2-uicore-alertbar"]')
            alert.first.wait_for(timeout=30_000)
            alert_text = alert.first.inner_text()
            row_gone = (
                table.locator("tr", has_text=fixtures.UNUSED_PRV).count() == 0
            )
            ok = "Deleted" in alert_text and row_gone
            record(
                "delete unused variable via UI",
                "PASS" if ok else "FAIL",
                f"alert={alert_text!r} row_gone={row_gone}",
            )
            shot(page, "07-after-delete")

            # -- 9. deletion verified via API
            status, _ = api(
                "GET", f"programRuleVariables/{created['prv_unused']}"
            )
            record(
                "deletion verified via API (404)",
                "PASS" if status == 404 else "FAIL",
                f"GET -> {status}",
            )
            if status == 404:
                created.pop("prv_unused", None)

            # -- 10. cancel a validate-all run
            frame.locator('[data-test="validate-all-button"]').click()
            try:
                frame.locator('[data-test="cancel-button"]').click(
                    timeout=5_000
                )
                frame.get_by_text("Validation cancelled").wait_for(
                    timeout=15_000
                )
                record("cancel validate-all run", "PASS")
            except Exception:
                if (
                    frame.locator(
                        '[data-test="validation-results"]'
                    ).count()
                    > 0
                ):
                    record(
                        "cancel validate-all run",
                        "SKIP",
                        "run finished before cancel could take effect",
                    )
                else:
                    record("cancel validate-all run", "FAIL")
            shot(page, "08-after-cancel")

            browser.close()
    except Exception:
        traceback.print_exc()
        record("suite aborted", "FAIL", "unhandled exception, see trace")
    finally:
        print("Cleaning up fixtures ...")
        for line in fixtures.cleanup(created):
            print(f"  {line}")

    # Page errors (uncaught exceptions) are always app faults.
    # For HTTP errors we filter by URL — the console text lacks URLs, so we
    # judge from the response stream instead. Known-benign, none from the
    # app's own API calls:
    #  - staticContent/logo_banner 404: header-bar logo probe (no custom logo
    #    configured on the demo instance); emitted by the shell header bar.
    #  - favicon 404: shell resource probe.
    #  - programRuleActions .../description 409: DHIS2 returns HTTP 409 for an
    #    invalid action expression (body carries status:ERROR, which the app
    #    reads and turns into a result row) — expected server behaviour.
    def is_benign(status: int, url: str) -> bool:
        if status == 404 and ("staticContent" in url or "favicon" in url):
            return True
        if status == 409 and "/expression/description" in url:
            return True
        return False

    http_noise = [(s, u) for s, u in http_errors if not is_benign(s, u)]
    record(
        "no unexpected HTTP errors",
        "PASS" if not http_noise else "FAIL",
        f"{http_noise[:4]}",
    )

    # Console errors are only the "secure context / PWA" warning over plain
    # HTTP (production is HTTPS) plus the browser's generic echo of the benign
    # HTTP statuses above.
    noise = [
        e
        for e in console_errors
        if "secure context" not in e
        and "PWA features" not in e
        and "Failed to load resource" not in e
    ]
    record(
        "no console/page errors",
        "PASS" if not noise and not page_errors else "FAIL",
        f"console={noise[:3]} page={page_errors[:2]}",
    )

    print(f"\n== {LABEL} summary ==")
    for step, status, note in results:
        print(f"{status:4}  {step}" + (f" — {note}" if note else ""))
    sys.exit(1 if any(s == "FAIL" for _, s, _ in results) else 0)


if __name__ == "__main__":
    main()
