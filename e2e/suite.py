#!/usr/bin/env python3
"""End-to-end suite for the Program Rule Validator. Run it through e2e/run.sh.

Installs the bundle, seeds a throwaway program, drives the app in Chromium and
writes $RESULTS_DIR/results.json (contract version 1, TESTING.md in
reference-tool-conventions). Frame-aware: DHIS2 2.42+ serves apps inside the
global-shell iframe, 2.41 and earlier at the top level.
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable
from urllib.parse import urlparse

import fixtures
from dhis2_api import Dhis2Client

CONTRACT_VERSION = 1
DEFAULT_TIMEOUT_MS = 30_000
RUN_TIMEOUT_MS = 180_000

# Selectors used more than once.
PROGRAM_SELECT = "program-select"
SELECT_INPUT = '[data-test="dhis2-uicore-select-input"]'
MENU_OPTION = '[data-test="dhis2-uicore-multiselectoption"]'
FILTER_INPUT = '[data-test="dhis2-uicore-select-filterinput"] input'
VALIDATE_SELECTED = '[data-test="validate-selected-button"]'
VALIDATE_ALL = '[data-test="validate-all-button"]'
CANCEL = '[data-test="cancel-button"]'
RESULTS = '[data-test="validation-results"]'
PROGRESS = '[data-test="validation-progress"]'
TAB_CONDITIONS = '[data-test="tab-invalid-conditions"]'
TAB_ACTIONS = '[data-test="tab-invalid-actions"]'
TAB_UNUSED = '[data-test="tab-unused-variables"]'
TABLE_CONDITIONS = '[data-test="invalid-conditions-table"]'
TABLE_ACTIONS = '[data-test="invalid-actions-table"]'
TABLE_UNUSED = '[data-test="unused-variables-table"]'
UNVALIDATED_WARNING = '[data-test="unvalidated-expressions-warning"]'
DESCRIPTION_URL_PART = "/description"
ALERT = '[data-test="dhis2-uicore-alertbar"]'


class SetupError(Exception):
    """The suite could not run (exit code 2)."""

    def __init__(self, stage: str, message: str):
        super().__init__(f"{stage}: {message}")
        self.stage = stage


@dataclass
class Context:
    client: Dhis2Client
    seed: fixtures.Seed
    results_dir: str
    label: str
    page: object = None
    frame: object = None
    phase: str = ""
    http_errors: list = field(default_factory=list)
    console_errors: list = field(default_factory=list)
    page_errors: list = field(default_factory=list)

    def shot(self, name: str) -> None:
        try:
            path = os.path.join(self.results_dir, f"{self.label}-{name}.png")
            self.page.screenshot(path=path, full_page=True)
        except Exception as error:  # a screenshot must never fail a test
            print(f"  (screenshot {name} failed: {error})")


# ── App install ──────────────────────────────────────────────────────────


def read_manifest(zip_path: str) -> dict:
    with zipfile.ZipFile(zip_path) as bundle:
        return json.loads(bundle.read("manifest.webapp"))


def install_app(client: Dhis2Client, zip_path: str, manifest_name: str) -> str:
    response = client.upload_app(zip_path)
    if not response.ok:
        raise SetupError("install", f"POST /api/apps -> {response.status}: {response.body}")
    # The server derives the key from the manifest; ask it rather than guess.
    for _ in range(30):
        apps = client.get("apps").body or []
        for app in apps:
            if app.get("name") == manifest_name:
                return os.environ.get("APP_KEY") or app["key"]
        time.sleep(1)
    raise SetupError("install", f"app named {manifest_name!r} not listed in /api/apps")


def uninstall_app(client: Dhis2Client, app_key: str) -> None:
    client.delete(f"apps/{app_key}")
    keys = [app.get("key") for app in client.get("apps").body or []]
    if app_key in keys:
        print(f"  warning: {app_key} still installed after DELETE")


# ── UI helpers ───────────────────────────────────────────────────────────


def find_app_frame(page):
    """The frame holding the app: the page on <=2.41, an iframe on 2.42+."""
    deadline = time.time() + 60
    while time.time() < deadline:
        for frame in page.frames:
            try:
                if frame.locator(f'[data-test="{PROGRAM_SELECT}"]').count() > 0:
                    return frame
            except Exception:
                continue
        page.wait_for_timeout(500)
    raise AssertionError(f"app frame not found; frames: {[f.url for f in page.frames]}")


def open_program_menu(ctx: Context) -> None:
    ctx.frame.locator(f'[data-test="{PROGRAM_SELECT}"] {SELECT_INPUT}').click()
    ctx.frame.locator(MENU_OPTION).first.wait_for(state="visible")


def close_menu(ctx: Context) -> None:
    ctx.page.keyboard.press("Escape")
    ctx.frame.locator(MENU_OPTION).first.wait_for(state="hidden")


def choose_program(ctx: Context, label: str) -> None:
    open_program_menu(ctx)
    filter_input = ctx.frame.locator(FILTER_INPUT)
    if filter_input.count() > 0 and filter_input.first.is_visible():
        filter_input.first.fill(label)
    ctx.frame.locator(MENU_OPTION, has_text=label).first.click()
    close_menu(ctx)


WATCH_RESULTS_JS = """(selector) => {
    window.__e2eRunStarted = document.querySelector(selector) === null
    const observer = new MutationObserver(() => {
        if (document.querySelector(selector) === null) {
            window.__e2eRunStarted = true
            observer.disconnect()
        }
    })
    observer.observe(document.body, { childList: true, subtree: true })
}"""


def run_validation(ctx: Context, button: str) -> None:
    """Click a run button and wait for that run's results.

    The app hides the previous results while a run is going, so a run has
    started once they are gone. Watching for that, rather than for the
    progress bar, also catches a run that finishes between two polls.
    """
    ctx.frame.evaluate(WATCH_RESULTS_JS, RESULTS)
    ctx.frame.locator(button).click()
    ctx.frame.wait_for_function("window.__e2eRunStarted === true")
    ctx.frame.locator(PROGRESS).wait_for(state="detached", timeout=RUN_TIMEOUT_MS)
    ctx.frame.locator(RESULTS).wait_for(timeout=RUN_TIMEOUT_MS)


def table_rows(ctx: Context, tab: str, table: str, text: str):
    ctx.frame.locator(tab).click()
    ctx.frame.locator(table).wait_for()
    return ctx.frame.locator(f"{table} tbody tr", has_text=text)


# ── Tests ────────────────────────────────────────────────────────────────
# Each returns a note on success and raises AssertionError on failure.


def test_app_loads(ctx: Context) -> str:
    ctx.frame = find_app_frame(ctx.page)
    return f"iframe={ctx.frame != ctx.page.main_frame}"


def test_programs_listed(ctx: Context) -> str:
    open_program_menu(ctx)
    count = ctx.frame.locator(MENU_OPTION).count()
    found = ctx.frame.locator(MENU_OPTION, has_text=ctx.seed.program_name).count()
    ctx.shot("01-programs-open")
    close_menu(ctx)
    assert found == 1, f"seeded program not in the menu ({count} options)"
    return f"{count} options"


def test_validate_selected_disabled(ctx: Context) -> str:
    assert ctx.frame.locator(VALIDATE_SELECTED).is_disabled(), "button enabled with no selection"
    return ""


def test_validate_selected_run(ctx: Context) -> str:
    choose_program(ctx, ctx.seed.program_name)
    run_validation(ctx, VALIDATE_SELECTED)
    ctx.shot("02-results")
    assert ctx.frame.locator(UNVALIDATED_WARNING).count() == 0, "some expressions reported as not validated"
    return ""


def test_invalid_condition(ctx: Context) -> str:
    rows = table_rows(ctx, TAB_CONDITIONS, TABLE_CONDITIONS, ctx.seed.rule_invalid_condition)
    ctx.shot("03-invalid-conditions")
    assert rows.count() == 1, f"expected 1 row, found {rows.count()}"
    return rows.inner_text()[:120].replace("\n", " | ")


def test_invalid_action(ctx: Context) -> str:
    rows = table_rows(ctx, TAB_ACTIONS, TABLE_ACTIONS, ctx.seed.rule_invalid_action)
    ctx.shot("04-invalid-actions")
    assert rows.count() == 1, f"expected 1 row, found {rows.count()}"
    return rows.inner_text()[:120].replace("\n", " | ")


def test_valid_rule_not_listed(ctx: Context) -> str:
    name = ctx.seed.rule_valid
    in_conditions = table_rows(ctx, TAB_CONDITIONS, TABLE_CONDITIONS, name).count()
    in_actions = table_rows(ctx, TAB_ACTIONS, TABLE_ACTIONS, name).count()
    assert in_conditions == 0 and in_actions == 0, f"valid rule listed: conditions={in_conditions} actions={in_actions}"
    return ""


def test_unused_variable(ctx: Context) -> str:
    rows = table_rows(ctx, TAB_UNUSED, TABLE_UNUSED, ctx.seed.program_name)
    names = rows.all_inner_texts()
    ctx.shot("05-unused-variables")
    listed = [n for n in names if ctx.seed.unused_var in n]
    assert len(listed) == 1, f"unused variable rows: {len(listed)}"
    return ""


def test_used_variables_not_listed(ctx: Context) -> str:
    rows = table_rows(ctx, TAB_UNUSED, TABLE_UNUSED, ctx.seed.program_name)
    text = "\n".join(rows.all_inner_texts())
    wrongly = [name for name in ctx.seed.used_vars if name in text]
    assert not wrongly, f"used variables listed as unused: {wrongly}"
    assert rows.count() == 1, f"expected only the unused variable, found {rows.count()} rows"
    return ""


def test_delete_unused_variable(ctx: Context) -> str:
    rows = table_rows(ctx, TAB_UNUSED, TABLE_UNUSED, ctx.seed.unused_var)
    rows.locator('[data-test="variable-checkbox"]').click()
    ctx.frame.locator('[data-test="delete-selected-button"]').click()
    ctx.frame.locator('[data-test="delete-confirm-modal"]').wait_for()
    ctx.shot("06-delete-modal")
    ctx.frame.locator('[data-test="delete-confirm-button"]').click()
    alert = ctx.frame.locator(ALERT, has_text="Deleted 1 variable")
    alert.first.wait_for()
    ctx.frame.locator(f"{TABLE_UNUSED} tbody tr", has_text=ctx.seed.unused_var).wait_for(state="detached")
    ctx.shot("07-after-delete")
    return ""


def test_delete_verified_api(ctx: Context) -> str:
    ids = ctx.seed.ids
    gone = ctx.client.get(f"programRuleVariables/{ids[ctx.seed.unused_var]}").status
    assert gone == 404, f"deleted variable still readable: GET -> {gone}"
    kept = {n: ctx.client.get(f"programRuleVariables/{ids[n]}").status for n in ctx.seed.used_vars}
    assert all(s == 200 for s in kept.values()), f"used variables affected: {kept}"
    return ""


def test_server_error_not_invalid(ctx: Context) -> str:
    """A 500 with a status ERROR body must not be listed as an invalid rule."""
    body = json.dumps({"httpStatus": "Internal Server Error", "httpStatusCode": 500, "status": "ERROR"})

    def fail(route):
        route.fulfill(status=500, content_type="application/json", body=body)

    ctx.phase = "server-error"
    ctx.page.route(f"**{DESCRIPTION_URL_PART}*", fail)
    try:
        run_validation(ctx, VALIDATE_SELECTED)
        ctx.shot("08-server-errors")
        warning = ctx.frame.locator(UNVALIDATED_WARNING).count()
        invalid = table_rows(ctx, TAB_CONDITIONS, TABLE_CONDITIONS, ctx.seed.program_name).count()
        invalid += table_rows(ctx, TAB_ACTIONS, TABLE_ACTIONS, ctx.seed.program_name).count()
    finally:
        ctx.page.unroute(f"**{DESCRIPTION_URL_PART}*")
        ctx.phase = ""
    assert warning == 1, "no 'could not be validated' warning"
    assert invalid == 0, f"{invalid} rows listed as invalid after server errors"
    return ""


def test_cancel_validate_all(ctx: Context) -> str:
    # Slow every request down so the run is still going when Cancel is clicked.
    cdp = ctx.page.context.new_cdp_session(ctx.page)
    cdp.send("Network.enable")
    cdp.send(
        "Network.emulateNetworkConditions",
        {"offline": False, "latency": 2000, "downloadThroughput": -1, "uploadThroughput": -1},
    )
    try:
        ctx.frame.locator(VALIDATE_ALL).click()
        ctx.frame.locator(CANCEL).click()
        ctx.frame.get_by_text("Validation cancelled").wait_for()
    finally:
        cdp.send(
            "Network.emulateNetworkConditions",
            {"offline": False, "latency": 0, "downloadThroughput": -1, "uploadThroughput": -1},
        )
    ctx.shot("09-after-cancel")
    assert ctx.frame.locator(CANCEL).count() == 0, "cancel button still shown"
    assert ctx.frame.locator(VALIDATE_ALL).is_enabled(), "validate-all not re-enabled"
    return ""


def _is_benign(phase: str, status: int, url: str) -> bool:
    # Header-bar logo and favicon probes on an instance without custom assets.
    if status == 404 and ("staticContent" in url or "favicon" in url):
        return True
    # DHIS2 answers an invalid action expression with 409 and status ERROR.
    if status == 409 and DESCRIPTION_URL_PART in url:
        return True
    # The 500s test_server_error_not_invalid injects.
    return phase == "server-error" and status == 500 and DESCRIPTION_URL_PART in url


def test_no_http_errors(ctx: Context) -> str:
    unexpected = [(s, u) for p, s, u in ctx.http_errors if not _is_benign(p, s, u)]
    assert not unexpected, f"{unexpected[:4]}"
    return ""


def test_no_console_errors(ctx: Context) -> str:
    # Over plain HTTP the PWA reports a missing secure context; the browser also
    # echoes each failed request, which test_no_http_errors judges by URL.
    noise = [
        e
        for e in ctx.console_errors
        if "secure context" not in e and "PWA" not in e and "Failed to load resource" not in e
    ]
    assert not noise and not ctx.page_errors, f"console={noise[:3]} page={ctx.page_errors[:2]}"
    return ""


# (id, function, ids that must have passed first)
TESTS: list[tuple[str, Callable[[Context], str], list[str]]] = [
    ("app-loads", test_app_loads, []),
    ("programs-listed", test_programs_listed, ["app-loads"]),
    ("validate-selected-disabled-without-selection", test_validate_selected_disabled, ["app-loads"]),
    ("validate-selected-run", test_validate_selected_run, ["programs-listed"]),
    ("invalid-condition-detected", test_invalid_condition, ["validate-selected-run"]),
    ("invalid-action-detected", test_invalid_action, ["validate-selected-run"]),
    ("valid-rule-not-listed", test_valid_rule_not_listed, ["validate-selected-run"]),
    ("unused-variable-detected", test_unused_variable, ["validate-selected-run"]),
    ("used-variables-not-listed", test_used_variables_not_listed, ["validate-selected-run"]),
    ("delete-unused-variable-ui", test_delete_unused_variable, ["unused-variable-detected"]),
    ("deletion-verified-api", test_delete_verified_api, ["delete-unused-variable-ui"]),
    ("server-error-not-reported-invalid", test_server_error_not_invalid, ["validate-selected-run"]),
    ("cancel-validate-all", test_cancel_validate_all, ["app-loads"]),
    ("no-unexpected-http-errors", test_no_http_errors, ["app-loads"]),
    ("no-console-errors", test_no_console_errors, ["app-loads"]),
]


def run_tests(ctx: Context) -> list[dict]:
    outcomes: list[dict] = []
    passed: set[str] = set()
    for test_id, func, requires in TESTS:
        missing = [r for r in requires if r not in passed]
        if missing:
            outcomes.append({"id": test_id, "status": "skip", "message": f"needs {', '.join(missing)}"})
        else:
            try:
                note = func(ctx)
                outcomes.append({"id": test_id, "status": "pass", "message": note})
                passed.add(test_id)
            except Exception as error:
                ctx.shot(f"fail-{test_id}")
                message = str(error).splitlines()[0][:300] if str(error) else type(error).__name__
                outcomes.append({"id": test_id, "status": "fail", "message": message})
        last = outcomes[-1]
        print(f"  [{last['status'].upper():4}] {test_id}" + (f" - {last['message']}" if last["message"] else ""))
    return outcomes


def run_browser(ctx: Context, app_url: str) -> list[dict]:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            context.set_default_timeout(DEFAULT_TIMEOUT_MS)
            name, value = ctx.client.session_cookie()
            host = urlparse(ctx.client.base_url).hostname
            context.add_cookies([{"name": name, "value": value, "domain": host, "path": "/"}])
            page = context.new_page()
            page.on("console", lambda m: ctx.console_errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: ctx.page_errors.append(str(e)))
            page.on(
                "response",
                lambda r: ctx.http_errors.append((ctx.phase, r.status, r.url)) if r.status >= 400 else None,
            )
            ctx.page = page
            page.goto(app_url, wait_until="domcontentloaded")
            return run_tests(ctx)
        finally:
            browser.close()


# ── Orchestration ────────────────────────────────────────────────────────


def write_results(results_dir: str, data: dict) -> None:
    with open(os.path.join(results_dir, "results.json"), "w") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


def tally(tests: list[dict]) -> dict:
    counts = {s: sum(1 for t in tests if t["status"] == s) for s in ("pass", "fail", "skip")}
    return {"total": len(tests), "passed": counts["pass"], "failed": counts["fail"], "skipped": counts["skip"]}


def cleanup(client: Dhis2Client, app_key: str | None, connected: bool) -> list[str]:
    if not connected:
        return []
    problems = []
    try:
        left = fixtures.purge(client)
        if left:
            problems.append(f"objects left behind: {left}")
    except Exception as error:
        problems.append(f"purge failed: {error}")
    if app_key:
        uninstall_app(client, app_key)
    return problems


def main() -> int:
    started = time.time()
    results_dir = os.environ["RESULTS_DIR"]
    zip_path = os.path.abspath(os.environ["APP_ZIP"])
    client = Dhis2Client(os.environ["DHIS2_URL"], os.environ["DHIS2_USER"], os.environ["DHIS2_PASS"])
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    result: dict = {"contract_version": CONTRACT_VERSION, "label": os.environ.get("LABEL", "")}
    app_key = None
    connected = False
    tests: list[dict] = []
    error = None
    try:
        info = client.get("system/info")
        if not info.ok:
            raise SetupError("connect", f"GET /api/system/info -> {info.status}")
        connected = True
        result["server_version"] = info.body["version"]
        result["label"] = result["label"] or result["server_version"]
        manifest = read_manifest(zip_path)
        result["app_version"] = manifest.get("version", "")
        print(f"== {result['label']}: {client.base_url} (DHIS2 {result['server_version']}), run {run_id} ==")

        left = fixtures.purge(client)
        if left:
            raise SetupError("purge", f"could not delete leftovers of an earlier run: {left}")
        app_key = install_app(client, zip_path, manifest["name"])
        result["app_key"] = app_key
        seed = fixtures.Seed(run_id)
        try:
            fixtures.create(client, seed)
        except Exception as exc:
            raise SetupError("seed", str(exc)) from exc

        ctx = Context(client=client, seed=seed, results_dir=results_dir, label=result["label"])
        tests = run_browser(ctx, client.url(f"apps/{app_key}/index.html"))
    except SetupError as exc:
        error = exc
    except Exception as exc:
        traceback.print_exc()
        error = SetupError("suite", f"{type(exc).__name__}: {exc}")
    finally:
        print("Cleaning up ...")
        problems = cleanup(client, app_key, connected)
        for problem in problems:
            print(f"  {problem}")

    if problems and error is None:
        tests.append({"id": "cleanup", "status": "fail", "message": "; ".join(problems)})
    result["duration_s"] = round(time.time() - started)
    if error is not None:
        result |= {"error": str(error), **tally([]), "tests": []}
        write_results(results_dir, result)
        print(f"ERROR {error}")
        return 2
    result |= {**tally(tests), "tests": tests}
    write_results(results_dir, result)
    print(f"== {result['passed']}/{result['total']} passed, {result['failed']} failed, {result['skipped']} skipped ==")
    return 1 if result["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
