# State changes: Program Rule Validator review, 2026-07-11

Every persistent change made during this review, and its disposition.

## Project files

| File | Change | Disposition |
|---|---|---|
| (none) | The review did not modify any application source. All migration work was committed separately on branch `app-platform`; the review is read-only against that branch. | n/a |
| `tests/e2e/*`, `docs/review-2026-07-11/*` | Added the e2e suite and this review's artefacts. | Kept in-repo (review deliverables). |

## DHIS2 instances (broker)

| Instance | Version | Seed | Disposition |
|---|---|---|---|
| `agent-prv-sl40` | 2.40.12 | sierra-leone V40 | **Created and deleted** by this review. |
| `agent-prv-sl42` | 2.42.x | sierra-leone v42 | **Created and deleted** by this review. |
| `agent-prv-sl43` | 2.43.0.1 | sierra-leone v43 | **Created and deleted** by this review. |
| `agent-laos-hmis` | 2.41.9 | Laos HMIS demo | **Left running** — pre-existed this session (not created here); used for the 2.41 + Laos-database run. |
| `agent-android-test` | — | — | **Left running** — pre-existed this session, untouched by this review. |

## Test data created

Per run, the e2e suite seeds one throwaway program (`ZZ Agent PRV Test Program`)
with 2 program rule variables, 3 program rules and 2 program rule actions, then
deletes them in `fixtures.cleanup()` at the end of the run (the app itself
deletes the one "unused" variable mid-test; the rest are deleted by the suite).
All UIDs are per-run and were removed. Verified no `ZZ Agent` / `agent_` objects
remain on any reused instance.

| Object type | Instance | Deleted? |
|---|---|---|
| program / programRuleVariables / programRules / programRuleActions (throwaway fixtures) | every tested instance | Yes — by `fixtures.cleanup()` and the app's own delete flow |

## System settings changed

None. The app installs from the built zip via `POST /api/apps` and is driven at
its own origin, so no `corsWhitelist` edit was needed. The app was uninstalled
(`DELETE /api/apps/tool-pr-validator` → 204) after each run except where a run
kept it for follow-up inspection, then removed with the instance.

## Not reverted — action needed

`agent-laos-hmis` and `agent-android-test` remain running; both predate this
review and were not created by it. Delete them via the broker if no longer
needed. All three `agent-prv-sl4x` instances created for this review were
deleted. No project files, system settings, or test data persist.
