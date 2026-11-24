#!/usr/bin/env python3
"""End-to-end suite for the Program Rule Validator Tool.

Run it through run.sh, which checks the environment. See e2e/README.md and
the e2e/run.sh contract in TESTING.md of dhis2-utils/reference-tool-conventions.
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
import zipfile
from urllib.parse import urlparse

from playwright.sync_api import Frame, Page, sync_playwright

import fixtures
import state
from dhis2_api import BASE, api, session_cookie, upload_app

CONTRACT_VERSION = 1
APP_ZIP = os.environ["APP_ZIP"]
RESULTS_DIR = os.environ["RESULTS_DIR"]

# Selectors
PROGRAM_SELECT = '[data-test="program-select"]'
SELECT_INPUT = '[data-test="dhis2-uicore-select-input"]'
MENU_OPTION = '[data-test="dhis2-uicore-multiselectoption"]'
FILTER_INPUT = '[data-test="dhis2-uicore-multiselect-filterinput"] input'
VALIDATE_SELECTED = '[data-test="validate-selected-button"]'
VALIDATE_ALL = '[data-test="validate-all-button"]'
CANCEL_RUN = '[data-test="cancel-button"]'
RESULTS = '[data-test="validation-results"]'
TAB_CONDITIONS = '[data-test="tab-invalid-conditions"]'
TAB_ACTIONS = '[data-test="tab-invalid-actions"]'
TAB_UNUSED = '[data-test="tab-unused-variables"]'
CONDITIONS_TABLE = '[data-test="invalid-conditions-table"]'
ACTIONS_TABLE = '[data-test="invalid-actions-table"]'
UNUSED_TABLE = '[data-test="unused-variables-table"]'
ROW_CHECKBOX = '[data-test="variable-checkbox"]'
DELETE_SELECTED = '[data-test="delete-selected-button"]'
MODAL = '[data-test="delete-confirm-modal"]'
MODAL_LIST = '[data-test="delete-confirm-list"]'
BACKUP_BUTTON = '[data-test="delete-backup-button"]'
CONFIRM_DELETE = '[data-test="delete-confirm-button"]'
ALERT = '[data-test="dhis2-uicore-alertbar"]'
EDIT_LINK = '[data-test="edit-in-app-link"]'
STALE_NOTICE = '[data-test="unused-variables-stale-notice"]'

RUN_TIMEOUT_MS = 600_000


class Run:
    """Results of one run, in the shape results.json needs."""

    def __init__(self, label: str):
        self.label = label
        self.tests: list[dict] = []

    def record(self, test_id: str, passed: bool, message: str = "") -> None:
        status = "pass" if passed else "fail"
        self.tests.append({"id": test_id, "status": status, "message": message})
        print(f"  [{status.upper()}] {test_id}" + (f": {message}" if message else ""))

    def skip(self, test_id: str, message: str) -> None:
        self.tests.append({"id": test_id, "status": "skip", "message": message})
        print(f"  [SKIP] {test_id}: {message}")

    def failed(self) -> bool:
        return any(t["status"] == "fail" for t in self.tests)


class Browser:
    """The page, the app's frame, and what the page reported."""

    def __init__(self, page: Page):
        self.page = page
        self.frame: Frame | None = None
        self.http_errors: list[tuple[int, str, str]] = []
        self.page_errors: list[str] = []
        self.console_errors: list[str] = []
        self.phase = "normal"
        page.on("pageerror", lambda e: self.page_errors.append(str(e)))
        page.on(
            "console",
            lambda m: self.console_errors.append(m.text) if m.type == "error" else None,
        )
        page.on(
            "response",
            lambda r: self.http_errors.append((r.status, r.url, self.phase))
            if r.status >= 400
            else None,
        )

    @property
    def app(self) -> Frame:
        if self.frame is None:
            raise RuntimeError("app frame not found")
        return self.frame

    def shot(self, run: Run, name: str) -> None:
        path = os.path.join(RESULTS_DIR, f"{run.label}-{name}.png")
        self.page.screenshot(path=path, full_page=True)


# --- setup -----------------------------------------------------------------


def manifest() -> dict:
    with zipfile.ZipFile(APP_ZIP) as bundle:
        return json.loads(bundle.read("manifest.webapp"))


def install_app(app_manifest: dict) -> str:
    status = upload_app(APP_ZIP)
    if not 200 <= status < 300:
        raise RuntimeError(f"app install -> HTTP {status}")
    if os.environ.get("APP_KEY"):
        return os.environ["APP_KEY"]
    # The server derives the key; find it by the manifest's name.
    _, apps = api("GET", "apps")
    for app in apps or []:
        if app.get("name") == app_manifest["name"]:
            return app["key"]
    raise RuntimeError(f"installed app {app_manifest['name']!r} not in /api/apps")


def uninstall_app(key: str) -> None:
    status, _ = api("DELETE", f"apps/{key}")
    print(f"Uninstall {key} -> {status}")


# --- helpers ---------------------------------------------------------------


def find_app_frame(page: Page) -> Frame:
    """The app's frame: the page on 2.41 and earlier, an iframe on 2.42+."""
    for _ in range(60):
        for frame in page.frames:
            try:
                if frame.locator(PROGRAM_SELECT).count() > 0:
                    return frame
            except Exception:  # noqa: BLE001 - frames come and go while loading
                continue
        page.wait_for_timeout(1000)
    raise RuntimeError(f"app frame not found; frames: {[f.url for f in page.frames]}")


def choose_program(b: Browser, name: str) -> None:
    app = b.app
    app.locator(f"{PROGRAM_SELECT} {SELECT_INPUT}").click()
    app.locator(MENU_OPTION).first.wait_for(state="visible", timeout=30_000)
    app.locator(FILTER_INPUT).fill(name)
    app.locator(MENU_OPTION, has_text=name).first.click()
    b.page.keyboard.press("Escape")


def table_rows(b: Browser, table: str, program_name: str) -> list[str]:
    rows = b.app.locator(f"{table} tbody tr", has_text=program_name)
    return [rows.nth(i).inner_text() for i in range(rows.count())]


def unused_row(b: Browser, name: str):
    return b.app.locator(f"{UNUSED_TABLE} tbody tr").filter(has_text=name)


def alert_texts(b: Browser) -> list[str]:
    alerts = b.app.locator(ALERT)
    return [alerts.nth(i).inner_text() for i in range(alerts.count())]


def run_validation(b: Browser, program_name: str) -> None:
    choose_program(b, program_name)
    b.app.locator(VALIDATE_SELECTED).click()
    b.app.locator(RESULTS).wait_for(timeout=RUN_TIMEOUT_MS)


# --- steps -----------------------------------------------------------------


def step_app_loads(run: Run, b: Browser, app_url: str) -> None:
    b.page.goto(app_url, wait_until="domcontentloaded")
    b.frame = find_app_frame(b.page)
    in_iframe = b.frame != b.page.main_frame
    run.record("app-loads", True, f"iframe={in_iframe}")


def step_programs_listed(run: Run, b: Browser) -> None:
    app = b.app
    app.locator(f"{PROGRAM_SELECT} {SELECT_INPUT}").click()
    app.locator(MENU_OPTION).first.wait_for(state="visible", timeout=30_000)
    count = app.locator(MENU_OPTION).count()
    b.page.keyboard.press("Escape")
    run.record("programs-listed", count > 0, f"{count} programs")


def step_validate_disabled(run: Run, b: Browser) -> None:
    disabled = b.app.locator(VALIDATE_SELECTED).is_disabled()
    run.record("validate-selected-disabled-without-selection", disabled)


def step_validation_runs(run: Run, b: Browser, fx: fixtures.Fixture) -> None:
    run_validation(b, fx.program_name)
    run.record("validation-completes", True)
    b.shot(run, "01-results")


def rule_suffixes(rows: list[str], fx: fixtures.Fixture) -> list[str]:
    """The part of each listed rule name after the fixture prefix and run id."""
    prefix = f"{fixtures.PREFIX} {fx.run_id} "
    names = [row.split("\t")[1].strip() for row in rows if "\t" in row]
    return sorted(name.removeprefix(prefix) for name in names)


def step_invalid_listed(run: Run, b: Browser, fx: fixtures.Fixture) -> None:
    b.app.locator(TAB_CONDITIONS).click()
    rows = table_rows(b, CONDITIONS_TABLE, fx.program_name)
    # Besides the invalid rule, expect the rules whose condition this
    # server's parser rejects (DHIS2 v40 has no d2:condition, for example).
    expected = sorted(
        ["invalid condition", *(f"uses {s}" for s in fx.rejected_styles)]
    )
    listed = rule_suffixes(rows, fx)
    run.record(
        "invalid-condition-listed",
        listed == expected,
        f"listed={listed}, expected={expected}",
    )
    b.app.locator(TAB_ACTIONS).click()
    listed = rule_suffixes(table_rows(b, ACTIONS_TABLE, fx.program_name), fx)
    run.record(
        "invalid-action-listed", listed == ["invalid action"], f"listed={listed}"
    )


def step_unused_detection(run: Run, b: Browser, fx: fixtures.Fixture) -> None:
    b.app.locator(TAB_UNUSED).click()
    for style, (_, name) in fx.used.items():
        count = unused_row(b, name).count()
        run.record(f"used-not-listed-{style}", count == 0, f"rows={count}")
    listed = [unused_row(b, n).count() for _, n in (fx.unused_delete, fx.unused_recheck)]
    run.record("unused-listed", listed == [1, 1], f"rows={listed}")
    b.shot(run, "02-unused")


def step_selection_survives_tabs(run: Run, b: Browser, fx: fixtures.Fixture) -> None:
    app = b.app
    unused_row(b, fx.unused_delete[1]).locator(ROW_CHECKBOX).click()
    app.locator(TAB_CONDITIONS).click()
    app.locator(TAB_UNUSED).click()
    checked = (
        unused_row(b, fx.unused_delete[1]).locator(f"{ROW_CHECKBOX} input").is_checked()
    )
    run.record("selection-survives-tab-switch", checked)


def step_modal_and_backup(run: Run, b: Browser, fx: fixtures.Fixture) -> None:
    app = b.app
    unused_row(b, fx.unused_recheck[1]).locator(ROW_CHECKBOX).click()
    app.locator(DELETE_SELECTED).click()
    app.locator(MODAL).wait_for(timeout=10_000)
    listed = app.locator(MODAL_LIST).inner_text()
    names = (fx.unused_delete[1], fx.unused_recheck[1])
    run.record("modal-lists-names", all(n in listed for n in names), listed[:160])
    b.shot(run, "03-modal")

    with b.page.expect_download(timeout=60_000) as info:
        app.locator(BACKUP_BUTTON).click()
    path = os.path.join(RESULTS_DIR, f"{run.label}-backup.json")
    info.value.save_as(path)
    with open(path, encoding="utf-8") as handle:
        saved = json.load(handle).get("programRuleVariables", [])
    ids = {v.get("id") for v in saved}
    expected = {fx.unused_delete[0], fx.unused_recheck[0]}
    complete = all(v.get("program", {}).get("id") == fx.program_id for v in saved)
    run.record(
        "backup-download",
        ids == expected and complete,
        f"{len(saved)} variables in the file",
    )


def step_delete(run: Run, b: Browser, fx: fixtures.Fixture) -> None:
    """Delete both ticked variables, after a rule starts using one of them."""
    fixtures.add_rule_using(fx, fx.unused_recheck[1])
    b.app.locator(CONFIRM_DELETE).click()
    b.app.locator(MODAL).wait_for(state="detached", timeout=60_000)
    b.app.locator(ALERT).first.wait_for(timeout=30_000)
    b.page.wait_for_timeout(1000)
    alerts = alert_texts(b)
    b.shot(run, "04-after-delete")

    deleted_status, _ = api("GET", f"programRuleVariables/{fx.unused_delete[0]}")
    row_gone = unused_row(b, fx.unused_delete[1]).count() == 0
    run.record(
        "delete-via-ui",
        deleted_status == 404
        and row_gone
        and any("Deleted 1 variable" in a for a in alerts),
        f"API GET -> {deleted_status}, row gone={row_gone}, alerts={alerts}",
    )
    kept_status, _ = api("GET", f"programRuleVariables/{fx.unused_recheck[0]}")
    warned = any("not deleted" in a for a in alerts)
    run.record(
        "delete-rechecks-rules",
        kept_status == 200 and warned,
        f"API GET -> {kept_status}, warned={warned}",
    )


# Metadata Management menu names, newest first, and the first version with
# an edit screen per object type (see src/lib/metadataAppLink.ts).
METADATA_MANAGEMENT_MODULES = [
    "dhis-web-metadata-management",
    "metadata-management",
    "maintenance-preview",
]
MIN_VERSION = {"programRule": (0, 135, 0), "programRuleVariable": (0, 119, 0)}


def _version(text: str) -> tuple[int, ...]:
    parts = text.split("-")[0].split(".")
    return tuple(int(p) if p.isdigit() else 0 for p in parts)


def expected_app(object_type: str) -> str | None:
    """The menu name of the app a link should open, by the documented rule."""
    _, menu = api("GET", "apps/menu")
    modules = {m["name"]: m for m in (menu or {}).get("modules", [])}
    for name in METADATA_MANAGEMENT_MODULES:
        module = modules.get(name)
        if module and (
            not module.get("version")
            or _version(module["version"]) >= MIN_VERSION[object_type]
        ):
            return name
    return "dhis-web-maintenance" if "dhis-web-maintenance" in modules else None


def _page_shows(page: Page, text: str) -> bool:
    """Wait up to a minute for any frame to show `text`, in text or a field."""
    for _ in range(60):
        for frame in page.frames:
            try:
                if frame.evaluate(
                    "n => [...document.querySelectorAll('input')]"
                    ".some(i => i.value === n) || document.body.innerText.includes(n)",
                    text,
                ):
                    return True
            except Exception:  # noqa: BLE001 - frames come and go while loading
                continue
        page.wait_for_timeout(1000)
    return False


def _check_edit_link(run: Run, b: Browser, case: dict) -> None:
    test_id = f"edit-link-{case['type']}"
    expected = expected_app(case["type"])
    link = case["row"].locator(EDIT_LINK)
    if expected is None:
        run.record(test_id, link.count() == 0, "no editing app: no link expected")
        return
    if link.count() == 0:
        run.record(test_id, False, f"no Edit link; expected {expected}")
        return
    href = link.get_attribute("href") or ""
    title = link.get_attribute("title") or ""
    page = b.page.context.new_page()
    try:
        page.goto(href, wait_until="domcontentloaded")
        opened = _page_shows(page, case["name"])
        page.screenshot(
            path=os.path.join(RESULTS_DIR, f"{run.label}-05-edit-{case['type']}.png")
        )
    finally:
        page.close()
    right_app = f"/{expected}/" in href
    run.record(
        test_id,
        right_app and opened and case["id"] in href,
        f"expected {expected}; href={href.replace(BASE, '')}; opened={opened}; "
        f"title={title!r}",
    )


def step_edit_link(run: Run, b: Browser, fx: fixtures.Fixture) -> None:
    app = b.app
    app.locator(TAB_CONDITIONS).click()
    rule_row = app.locator(f"{CONDITIONS_TABLE} tbody tr").filter(
        has_text="invalid condition"
    )
    rule_name = rule_row.locator("td").nth(1).inner_text()
    _check_edit_link(
        run,
        b,
        {
            "type": "programRule",
            "row": rule_row,
            "name": rule_name,
            "id": fx.rule_invalid_condition,
        },
    )
    app.locator(TAB_UNUSED).click()
    _check_edit_link(
        run,
        b,
        {
            "type": "programRuleVariable",
            "row": unused_row(b, fx.unused_recheck[1]),
            "name": fx.unused_recheck[1],
            "id": fx.unused_recheck[0],
        },
    )


def step_cancel_and_stale(run: Run, b: Browser) -> None:
    app = b.app
    app.locator(VALIDATE_ALL).click()
    try:
        app.locator(CANCEL_RUN).click(timeout=5_000)
        app.get_by_text("Validation cancelled").wait_for(timeout=30_000)
    except Exception:  # noqa: BLE001 - the run can finish before Cancel is clicked
        if app.locator(CANCEL_RUN).count() == 0:
            run.skip("cancel-run", "the run finished before Cancel was clicked")
            run.skip("stale-results-block-delete", "no cancelled run")
            return
        raise
    run.record("cancel-run", True)
    app.locator(TAB_UNUSED).click()
    notice = app.locator(STALE_NOTICE).count() > 0
    disabled = app.locator(DELETE_SELECTED).is_disabled()
    run.record("stale-results-block-delete", notice and disabled, f"notice={notice}")
    b.shot(run, "06-stale")


def step_session_expired(run: Run, b: Browser, fx: fixtures.Fixture) -> None:
    """End the session as the first description request goes out."""
    context = b.page.context
    cookies = context.cookies()
    seen = {"n": 0}

    def on_request(request) -> None:
        if "/description" in request.url:
            seen["n"] += 1
            if seen["n"] == 1:
                context.clear_cookies()

    b.phase = "session-expired"
    b.page.on("request", on_request)
    try:
        b.app.locator(VALIDATE_SELECTED).click()
        message = b.app.get_by_text("Your session has ended")
        message.wait_for(timeout=120_000)
        rows = table_rows(b, CONDITIONS_TABLE, "")
        unauthorized_rows = [r for r in rows if "Unauthorized" in r]
        run.record(
            "session-expiry-stops-run",
            not unauthorized_rows,
            f"rows reading Unauthorized={len(unauthorized_rows)}",
        )
        b.shot(run, "07-session-expired")
    finally:
        b.page.remove_listener("request", on_request)
        context.add_cookies(cookies)
        b.phase = "normal"


def step_hygiene(run: Run, b: Browser) -> None:
    def benign(status: int, url: str, phase: str) -> bool:
        if phase == "session-expired" and status == 401:
            return True
        # Header bar logo, favicon, and the app shell's lookup of optional
        # custom translations: none are configured on the demo databases.
        optional = ("staticContent", "favicon", "dataStore/custom-translations")
        if status == 404 and any(part in url for part in optional):
            return True
        # DHIS2 answers an invalid action expression with HTTP 409.
        return status == 409 and "/expression/description" in url

    unexpected = [(s, u) for s, u, p in b.http_errors if not benign(s, u, p)]
    run.record("no-unexpected-http-errors", not unexpected, str(unexpected[:4]))
    noise = [
        e
        for e in b.console_errors
        if "secure context" not in e
        and "PWA" not in e
        and "Failed to load resource" not in e
    ]
    run.record(
        "no-page-errors",
        not b.page_errors and not noise,
        f"page={b.page_errors[:2]} console={noise[:2]}",
    )


# --- main ------------------------------------------------------------------


def browser_steps(run: Run, fx: fixtures.Fixture, app_key: str) -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            context = browser.new_context(
                viewport={"width": 1440, "height": 900}, accept_downloads=True
            )
            name, value = session_cookie()
            context.add_cookies(
                [
                    {
                        "name": name,
                        "value": value,
                        "domain": urlparse(BASE).hostname,
                        "path": "/",
                        "httpOnly": True,
                        "sameSite": "Lax",
                    }
                ]
            )
            b = Browser(context.new_page())
            app_url = f"{BASE}/api/apps/{app_key}/index.html"
            steps = [
                lambda: step_app_loads(run, b, app_url),
                lambda: step_programs_listed(run, b),
                lambda: step_validate_disabled(run, b),
                lambda: step_validation_runs(run, b, fx),
                lambda: step_invalid_listed(run, b, fx),
                lambda: step_unused_detection(run, b, fx),
                lambda: step_selection_survives_tabs(run, b, fx),
                lambda: step_modal_and_backup(run, b, fx),
                lambda: step_delete(run, b, fx),
                lambda: step_edit_link(run, b, fx),
                lambda: step_cancel_and_stale(run, b),
                lambda: step_session_expired(run, b, fx),
            ]
            for step in steps:
                step()
            step_hygiene(run, b)
        except Exception as error:  # noqa: BLE001 - recorded as a failed test
            traceback.print_exc()
            run.record("suite-aborted", False, f"{type(error).__name__}: {error}"[:300])
        finally:
            browser.close()


def write_results(run: Run, info: dict, started: float, error: str | None) -> None:
    tally = {s: sum(t["status"] == s for t in run.tests) for s in ("pass", "fail", "skip")}
    result = {
        "contract_version": CONTRACT_VERSION,
        "label": run.label,
        "server_version": info.get("server_version", ""),
        "app_key": info.get("app_key", ""),
        "app_version": info.get("app_version", ""),
        "duration_s": round(time.time() - started),
        "total": len(run.tests),
        "passed": tally["pass"],
        "failed": tally["fail"],
        "skipped": tally["skip"],
        "tests": run.tests,
    }
    if error:
        result["error"] = error
    with open(os.path.join(RESULTS_DIR, "results.json"), "w", encoding="utf-8") as out:
        json.dump(result, out, indent=2)


def main() -> int:
    started = time.time()
    info: dict = {}
    status, system = api("GET", "system/info")
    info["server_version"] = (system or {}).get("version", "") if status == 200 else ""
    run = Run(os.environ.get("LABEL") or info["server_version"] or "unlabelled")
    print(f"== {run.label}: {BASE} (DHIS2 {info['server_version']}) ==")

    stage = "install"
    try:
        app_manifest = manifest()
        info["app_version"] = app_manifest.get("version", "")
        info["app_key"] = install_app(app_manifest)
        stage = "cleanup of an earlier run"
        for line in state.delete_recorded():
            print(f"  leftover {line}")
        stage = "seeding"
        fx = fixtures.seed()
    except Exception as error:  # noqa: BLE001 - reported with exit code 2
        traceback.print_exc()
        write_results(run, info, started, f"{stage} failed: {error}"[:500])
        if info.get("app_key"):
            state.delete_recorded()
            uninstall_app(info["app_key"])
        return 2

    try:
        browser_steps(run, fx, info["app_key"])
    finally:
        print("Cleaning up ...")
        for line in state.delete_recorded():
            print(f"  {line}")
        uninstall_app(info["app_key"])

    write_results(run, info, started, None)
    print(f"== {run.label}: {sum(t['status'] == 'pass' for t in run.tests)}/{len(run.tests)} passed ==")
    return 1 if run.failed() else 0


if __name__ == "__main__":
    sys.exit(main())
