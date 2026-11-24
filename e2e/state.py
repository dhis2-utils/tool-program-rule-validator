"""The record of what a run created, kept on the instance.

TESTING.md, "Seeding and cleanup": every object is recorded in the dataStore
at e2e-state/<repo name> before it is created. A run first deletes whatever
an earlier, interrupted run left in the record, and a clean run ends with
the record gone. The record lives on the instance because that is where the
leftovers are.
"""

from __future__ import annotations

from dhis2_api import api

NAMESPACE = "e2e-state"
KEY = "tool-program-rule-validator"
PATH = f"dataStore/{NAMESPACE}/{KEY}"

# Delete dependants first: rules hold the actions, rules and variables
# belong to the program.
DELETE_ORDER = ["programRules", "programRuleVariables", "programs"]


def read() -> dict[str, list[str]]:
    status, data = api("GET", PATH)
    if status == 404:
        return {}
    if status != 200:
        raise RuntimeError(f"GET {PATH} -> {status}")
    return data or {}


def _write(record: dict[str, list[str]]) -> None:
    status, _ = api("PUT", PATH, record)
    if status == 404:
        status, _ = api("POST", PATH, record)
    if status not in (200, 201):
        raise RuntimeError(f"write {PATH} -> {status}")


def add(resource: str, uids: list[str]) -> None:
    """Record objects before creating them."""
    record = read()
    record.setdefault(resource, [])
    record[resource] = sorted(set(record[resource]) | set(uids))
    _write(record)


def delete_recorded() -> list[str]:
    """Delete every recorded object, then the record. Return a log."""
    record = read()
    log = []
    for resource in DELETE_ORDER:
        for uid in record.get(resource, []):
            status, _ = api("DELETE", f"{resource}/{uid}")
            # 404: already gone, for example deleted by the app under test.
            log.append(f"{resource}/{uid} -> {status}")
            if status not in (200, 204, 404):
                raise RuntimeError(f"DELETE {resource}/{uid} -> {status}")
    if record:
        api("DELETE", PATH)
    return log
