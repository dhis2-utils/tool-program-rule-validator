"""Seeding and cleanup for the e2e suite (TESTING.md, "Seeding and cleanup").

Every object gets a run-unique name, and its UID is generated here so it can be
recorded in the dataStore (e2e-state/<repo>) before the object is created. At
the start of each run the suite deletes whatever an earlier, killed run left in
that record.

The seeded event program has:
  - a rule whose condition references a variable that does not exist (invalid)
  - a rule whose action data expression is missing an argument (invalid)
  - a valid rule that uses one variable as #{name}
  - variables used only in ways an earlier version missed: as a quoted argument
    to d2:count, inside the condition string of d2:countIfCondition, and in
    action content that contains apostrophes
  - one variable that nothing references (the only one the app may list)
"""

from __future__ import annotations

from dataclasses import dataclass, field

from dhis2_api import Dhis2Client, generate_uid

STATE_NAMESPACE = "e2e-state"
REPO = "tool-program-rule-validator"
STATE_PATH = f"dataStore/{STATE_NAMESPACE}/{REPO}"

# Delete in this order: rules (with their actions) before the variables and
# the program they belong to.
DELETE_ORDER = ["programRules", "programRuleVariables", "programs"]


@dataclass
class Seed:
    run_id: str
    program_id: str = field(default_factory=generate_uid)
    ids: dict[str, str] = field(default_factory=dict)

    @property
    def program_name(self) -> str:
        return f"E2E {REPO} {self.run_id}"

    def var(self, suffix: str) -> str:
        """Variable name; lowercase, no spaces, unique per run."""
        return f"e2e_{self.run_id.lower()}_{suffix}"

    def rule(self, suffix: str) -> str:
        return f"{self.program_name} {suffix}"

    @property
    def unused_var(self) -> str:
        return self.var("unused")

    @property
    def used_vars(self) -> list[str]:
        return [self.var(s) for s in ("hash", "count", "ifcond", "content")]

    @property
    def rule_invalid_condition(self) -> str:
        return self.rule("invalid condition")

    @property
    def rule_invalid_action(self) -> str:
        return self.rule("invalid action")

    @property
    def rule_valid(self) -> str:
        return self.rule("valid")


def _record(client: Dhis2Client, objects: list[dict]) -> None:
    exists = client.get(STATE_PATH).status == 200
    response = client.request("PUT" if exists else "POST", STATE_PATH, {"objects": objects})
    if not response.ok:
        raise RuntimeError(f"Could not write {STATE_PATH}: {response.status} {response.body}")


def purge(client: Dhis2Client) -> list[str]:
    """Delete everything the dataStore record lists, then the record.

    Returns the objects that could not be deleted; the record is kept, minus
    what was deleted, when anything is left.
    """
    response = client.get(STATE_PATH)
    if response.status == 404:
        return []
    if not response.ok:
        raise RuntimeError(f"Could not read {STATE_PATH}: {response.status}")
    objects = (response.body or {}).get("objects", [])
    rank = {kind: index for index, kind in enumerate(DELETE_ORDER)}
    left = []
    for obj in sorted(objects, key=lambda o: rank.get(o["type"], len(rank))):
        status = client.delete(f"{obj['type']}/{obj['id']}").status
        if status not in (200, 204, 404):
            left.append(obj)
    if left:
        _record(client, left)
        return [f"{o['type']}/{o['id']}" for o in left]
    client.delete(STATE_PATH)
    return []


def _action(rule_id: str, **fields) -> dict:
    return {
        "id": generate_uid(),
        "programRule": {"id": rule_id},
        "programRuleActionType": "SHOWWARNING",
        **fields,
    }


def _payload(seed: Seed) -> dict:
    program = {"id": seed.program_id}
    variables = [
        {
            "id": generate_uid(),
            "name": name,
            "program": program,
            "programRuleVariableSourceType": "CALCULATED_VALUE",
            "valueType": "NUMBER",
        }
        for name in [seed.unused_var, *seed.used_vars]
    ]
    hash_var, count_var, ifcond_var, content_var = seed.used_vars
    rule_specs = [
        (seed.rule_invalid_condition, f"#{{{seed.var('missing')}}} > 5", {}),
        (seed.rule_invalid_action, "true", {"content": "Invalid action", "data": "d2:daysBetween('2020-01-01')"}),
        (seed.rule_valid, f"#{{{hash_var}}} > 5", {"content": "Valid rule"}),
        (seed.rule("count"), f"d2:count('{count_var}') > 2", {"content": "Count"}),
        (
            seed.rule("count if condition"),
            f"d2:countIfCondition(#{{{hash_var}}}, '#{{{ifcond_var}}} > 3') > 0",
            {"content": "Count if condition"},
        ),
        (seed.rule("content"), "true", {"content": f"Don't forget #{{{content_var}}}, it's required"}),
    ]
    rules, actions = [], []
    for name, condition, action_fields in rule_specs:
        rule_id = generate_uid()
        action = _action(rule_id, **action_fields)
        actions.append(action)
        rules.append(
            {
                "id": rule_id,
                "name": name,
                "program": program,
                "condition": condition,
                "programRuleActions": [{"id": action["id"]}],
            }
        )
    seed.ids = {v["name"]: v["id"] for v in variables} | {r["name"]: r["id"] for r in rules}
    return {
        "programs": [
            {
                "id": seed.program_id,
                "name": seed.program_name,
                "shortName": seed.program_name[:50],
                "programType": "WITHOUT_REGISTRATION",
            }
        ],
        "programRuleVariables": variables,
        "programRules": rules,
        "programRuleActions": actions,
    }


def check_preconditions(client: Dhis2Client) -> None:
    """DHIS2 enrolls a new event program at the first root organisation unit,
    and the import fails with a 500 when there is none."""
    roots = client.get("organisationUnits?level=1&fields=id&paging=false")
    if not roots.ok or not (roots.body or {}).get("organisationUnits"):
        raise RuntimeError("the instance has no root organisation unit; an event program cannot be created")


def create(client: Dhis2Client, seed: Seed) -> None:
    """Record, then create, the seed objects in one metadata import."""
    check_preconditions(client)
    payload = _payload(seed)
    objects = [{"type": "programs", "id": seed.program_id}]
    objects += [{"type": "programRuleVariables", "id": v["id"]} for v in payload["programRuleVariables"]]
    objects += [{"type": "programRules", "id": r["id"]} for r in payload["programRules"]]
    _record(client, objects)

    response = client.request("POST", "metadata?importMode=COMMIT&atomicMode=ALL", payload)
    body = response.body or {}
    report = body.get("response") or body
    stats = report.get("stats") or {}
    if not response.ok or report.get("status") not in ("OK", "SUCCESS") or stats.get("ignored"):
        raise RuntimeError(f"Metadata import failed: {response.status} {str(body)[:500]}")

    # Read back: a 2xx alone does not prove the objects exist.
    for resource in ("programRuleVariables", "programRules"):
        check = client.get(f"{resource}?filter=program.id:eq:{seed.program_id}&fields=id&paging=false")
        found = {o["id"] for o in (check.body or {}).get(resource, [])} if check.ok else set()
        wanted = {o["id"] for o in payload[resource]}
        if found != wanted:
            raise RuntimeError(f"Seed read-back mismatch for {resource}: {check.status} {check.body}")
