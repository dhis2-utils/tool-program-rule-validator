"""Test metadata for the Program Rule Validator suite.

One event program, named with a fixed prefix and a run id, holding:

- one variable for each way a rule can reference a variable (the forms in
  src/lib/expressionUsage.ts), each used by exactly one valid rule, so none
  of them may be listed as unused;
- two variables that no rule references;
- a rule with an invalid condition and a rule with an invalid action.

Every UID is recorded in the e2e-state dataStore entry before the import.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

import state
from dhis2_api import api, new_uids

PREFIX = "E2E tool-program-rule-validator"

# Reference style -> (condition, action data, action content) templates.
# "{v}" is replaced by the variable name. Each style gets its own rule.
REFERENCE_STYLES: dict[str, tuple[str, str | None, str | None]] = {
    "hash": ("#{{{v}}} > 0", None, None),
    "attribute": ("A{{{v}}} > 0", None, None),
    "hasValue": ("d2:hasValue('{v}')", None, None),
    "count": ("d2:count('{v}') > 0", None, None),
    "countIfValue": ("d2:countIfValue('{v}', 1) > 0", None, None),
    "countIfZeroPos": ("d2:countIfZeroPos('{v}') > 0", None, None),
    "minValue": ("d2:minValue('{v}') > 0", None, None),
    "lastEventDate": ("d2:lastEventDate('{v}') != ''", None, None),
    "condition": ("d2:condition('#{{{v}}} > 0', true, false)", None, None),
    "maxValueInAction": ("true", "d2:maxValue('{v}')", "Warning"),
    "assignContent": ("true", "1", "#{{{v}}}"),
}


@dataclass
class Fixture:
    run_id: str
    program_id: str = ""
    program_name: str = ""
    used: dict[str, tuple[str, str]] = field(default_factory=dict)
    unused_delete: tuple[str, str] = ("", "")
    unused_recheck: tuple[str, str] = ("", "")
    rule_invalid_condition: str = ""
    rule_invalid_action: str = ""
    rule_ids: list[str] = field(default_factory=list)

    @property
    def missing_name(self) -> str:
        return f"e2e_missing_{self.run_id}"


def _var_name(run_id: str, label: str) -> str:
    return f"e2e_{label}_{run_id}"


def _variable(uid: str, name: str, program_id: str) -> dict:
    return {
        "id": uid,
        "name": name,
        "program": {"id": program_id},
        "programRuleVariableSourceType": "CALCULATED_VALUE",
        "valueType": "NUMBER",
    }


def _rule(uid: str, name: str, program_id: str, condition: str) -> dict:
    return {
        "id": uid,
        "name": name,
        "program": {"id": program_id},
        "condition": condition,
    }


def _action(uid: str, rule_id: str, data: str | None, content: str | None):
    action = {
        "id": uid,
        "programRule": {"id": rule_id},
        "programRuleActionType": "SHOWWARNING",
        "content": content or "Warning",
    }
    if content and content.startswith("#{"):
        action["programRuleActionType"] = "ASSIGN"
    if data is not None:
        action["data"] = data
    return action


def _import(payload: dict) -> None:
    status, response = api(
        "POST", "metadata?importMode=COMMIT&atomicMode=ALL", payload
    )
    body = (response or {}).get("response") or response or {}
    if status not in (200, 201) or body.get("status") not in ("OK", "SUCCESS"):
        raise RuntimeError(f"metadata import -> {status}: {str(response)[:800]}")


def _build_used(fx: Fixture, uids: list[str], payload: dict) -> None:
    for style, (condition, data, content) in REFERENCE_STYLES.items():
        var_uid, rule_uid, action_uid = uids.pop(), uids.pop(), uids.pop()
        name = _var_name(fx.run_id, style)
        fx.used[style] = (var_uid, name)
        payload["programRuleVariables"].append(
            _variable(var_uid, name, fx.program_id)
        )
        rule = _rule(
            rule_uid,
            f"{PREFIX} {fx.run_id} uses {style}",
            fx.program_id,
            condition.format(v=name),
        )
        fx.rule_ids.append(rule_uid)
        if data is not None or content is not None:
            data_text = data.format(v=name) if data else None
            content_text = content.format(v=name) if content else None
            rule["programRuleActions"] = [{"id": action_uid}]
            payload["programRuleActions"].append(
                _action(action_uid, rule_uid, data_text, content_text)
            )
        payload["programRules"].append(rule)


def _build_invalid(fx: Fixture, uids: list[str], payload: dict) -> None:
    fx.rule_invalid_condition = uids.pop()
    fx.rule_invalid_action = uids.pop()
    action_uid = uids.pop()
    fx.rule_ids += [fx.rule_invalid_condition, fx.rule_invalid_action]
    payload["programRules"] += [
        _rule(
            fx.rule_invalid_condition,
            f"{PREFIX} {fx.run_id} invalid condition",
            fx.program_id,
            f"#{{{fx.missing_name}}} > 5",
        ),
        {
            **_rule(
                fx.rule_invalid_action,
                f"{PREFIX} {fx.run_id} invalid action",
                fx.program_id,
                "true",
            ),
            "programRuleActions": [{"id": action_uid}],
        },
    ]
    payload["programRuleActions"].append(
        _action(
            action_uid,
            fx.rule_invalid_action,
            "d2:daysBetween('2020-01-01')",
            "Invalid action",
        )
    )


def seed() -> Fixture:
    run_id = time.strftime("%Y%m%dT%H%M%S")
    fx = Fixture(run_id=run_id)
    uids = new_uids(3 * len(REFERENCE_STYLES) + 10)
    fx.program_id = uids.pop()
    fx.program_name = f"{PREFIX} {run_id}"
    fx.unused_delete = (uids.pop(), _var_name(run_id, "unused_delete"))
    fx.unused_recheck = (uids.pop(), _var_name(run_id, "unused_recheck"))

    payload: dict = {
        "programs": [
            {
                "id": fx.program_id,
                "name": fx.program_name,
                "shortName": fx.program_name[:50],
                "programType": "WITHOUT_REGISTRATION",
            }
        ],
        "programRuleVariables": [
            _variable(uid, name, fx.program_id)
            for uid, name in (fx.unused_delete, fx.unused_recheck)
        ],
        "programRules": [],
        "programRuleActions": [],
    }
    _build_used(fx, uids, payload)
    _build_invalid(fx, uids, payload)

    state.add("programs", [fx.program_id])
    state.add(
        "programRuleVariables",
        [v["id"] for v in payload["programRuleVariables"]],
    )
    state.add("programRules", fx.rule_ids)
    _import(payload)
    return fx


def add_rule_using(fx: Fixture, variable_name: str) -> str:
    """Create a rule that references a variable, as a colleague might."""
    (uid,) = new_uids(1)
    state.add("programRules", [uid])
    _import(
        {
            "programRules": [
                _rule(
                    uid,
                    f"{PREFIX} {fx.run_id} added later",
                    fx.program_id,
                    f"d2:count('{variable_name}') > 0",
                )
            ]
        }
    )
    fx.rule_ids.append(uid)
    return uid
