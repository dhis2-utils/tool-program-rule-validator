"""Seed and clean up test metadata for the Program Rule Validator suite.

Creates a dedicated event program with:
  - a program rule with an INVALID condition (unknown variable reference)
  - a program rule with an INVALID action data expression
  - a program rule with a VALID condition referencing PRV 'agent_used_var'
  - PRV 'agent_used_var'  (referenced -> must NOT be listed as unused)
  - PRV 'agent_unused_var' (not referenced -> must be listed as unused)

Everything is tracked and deleted by cleanup(), except objects the app
itself deletes during the test (deleting an already-deleted PRV is fine —
404 is tolerated).
"""

from __future__ import annotations

from dhis2_helpers import api

PROGRAM_NAME = "ZZ Agent PRV Test Program"
RULE_INVALID_CONDITION = "ZZ Agent rule invalid condition"
RULE_INVALID_ACTION = "ZZ Agent rule invalid action"
RULE_VALID = "ZZ Agent rule valid"
USED_PRV = "agent_used_var"
UNUSED_PRV = "agent_unused_var"


def seed() -> dict:
    """Create the fixture objects in one metadata import; returns uids."""
    status, data = api("GET", "system/id?limit=7")
    assert status == 200, f"system/id -> {status}"
    (
        program_id,
        prv_used_id,
        prv_unused_id,
        rule1_id,
        rule2_id,
        rule3_id,
        action_valid_id,
    ) = data["codes"][:7]
    status, data = api("GET", "system/id?limit=1")
    action_invalid_id = data["codes"][0]

    program_ref = {"id": program_id}
    payload = {
        "programs": [
            {
                "id": program_id,
                "name": PROGRAM_NAME,
                "shortName": PROGRAM_NAME[:50],
                "programType": "WITHOUT_REGISTRATION",
            }
        ],
        "programRuleVariables": [
            {
                "id": prv_used_id,
                "name": USED_PRV,
                "program": program_ref,
                "programRuleVariableSourceType": "CALCULATED_VALUE",
                "valueType": "NUMBER",
            },
            {
                "id": prv_unused_id,
                "name": UNUSED_PRV,
                "program": program_ref,
                "programRuleVariableSourceType": "CALCULATED_VALUE",
                "valueType": "NUMBER",
            },
        ],
        "programRules": [
            {
                "id": rule1_id,
                "name": RULE_INVALID_CONDITION,
                "program": program_ref,
                "condition": "#{this_variable_does_not_exist} > 5",
            },
            {
                "id": rule2_id,
                "name": RULE_VALID,
                "program": program_ref,
                "condition": f"#{{{USED_PRV}}} > 5",
                "programRuleActions": [{"id": action_valid_id}],
            },
            {
                "id": rule3_id,
                "name": RULE_INVALID_ACTION,
                "program": program_ref,
                "condition": "true",
                "programRuleActions": [{"id": action_invalid_id}],
            },
        ],
        "programRuleActions": [
            {
                "id": action_valid_id,
                "programRule": {"id": rule2_id},
                "programRuleActionType": "SHOWWARNING",
                "content": "Agent test warning",
            },
            {
                "id": action_invalid_id,
                "programRule": {"id": rule3_id},
                "programRuleActionType": "SHOWWARNING",
                "content": "Agent invalid action",
                "data": "d2:daysBetween('2020-01-01')",
            },
        ],
    }
    status, response = api(
        "POST", "metadata?importMode=COMMIT&atomicMode=ALL", payload
    )
    stats = ((response or {}).get("response") or response or {}).get(
        "stats"
    ) or {}
    import_status = ((response or {}).get("response") or response or {}).get(
        "status"
    )
    assert status in (200, 201) and import_status in ("OK", "SUCCESS"), (
        f"metadata import -> {status}: {response}"
    )
    assert not stats or stats.get("ignored", 0) == 0, f"import ignored: {stats}"

    return {
        "program": program_id,
        "prv_used": prv_used_id,
        "prv_unused": prv_unused_id,
        "rule_invalid_condition": rule1_id,
        "rule_valid": rule2_id,
        "rule_invalid_action": rule3_id,
    }


def cleanup(created: dict) -> list[str]:
    """Delete fixture objects; returns list of 'resource/uid -> status' lines."""
    log = []
    order = [
        ("rule_invalid_condition", "programRules"),
        ("rule_invalid_action", "programRules"),
        ("rule_valid", "programRules"),
        ("prv_used", "programRuleVariables"),
        ("prv_unused", "programRuleVariables"),
        ("program", "programs"),
    ]
    for key, resource in order:
        uid = created.get(key)
        if not uid:
            continue
        status, _ = api("DELETE", f"{resource}/{uid}")
        log.append(f"{resource}/{uid} -> {status}")
    return log
