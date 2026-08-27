# Version/database test matrix: Program Rule Validator 1.0.0

Tested: 2026-08-27 · Bundle: `tool-pr-validator-1.0.0.zip` (branch `app-platform`, commit `c5c8ef26`) installed via `POST /api/apps` and driven with Playwright · Auth: `local_admin`

Each version was paired with a database whose seed is native to it, so no
Flyway cross-version migration was involved in any cell.

## Instances

| Version  | Database          | Content                                      | Seed                                   |
| -------- | ----------------- | -------------------------------------------- | -------------------------------------- |
| 2.41.9.1 | Laos HMIS demo    | 28 programs, 2699 rules, 2048 rule variables | `lao_hmis_demo_v41.sql.gz`             |
| 2.42.6   | EHR metadata      | 1 program, 698 rules, 350 rule variables     | `dhis2-ehr-meta_2026-07-17_v42.sql.gz` |
| 2.43.1   | Sierra Leone demo | 14 programs, 79 rules, 94 rule variables     | `dhis2-db-sierra-leone_v43.sql.gz`     |

## Results

Every step passed on every instance. Each run seeds a throwaway program with a
rule with an invalid condition, a rule with an invalid action expression, a
valid rule, and one used plus one unused rule variable, then deletes them.

| Step                                           | 2.41 Laos | 2.42 EHR | 2.43 SL   |
| ---------------------------------------------- | --------- | -------- | --------- |
| App loads                                      | PASS      | PASS     | PASS      |
| Program dropdown populated                     | PASS (29) | PASS (2) | PASS (15) |
| Validate-selected disabled with no selection   | PASS      | PASS     | PASS      |
| Validation run completes                       | PASS      | PASS     | PASS      |
| Invalid condition detected                     | PASS      | PASS     | PASS      |
| Invalid action expression detected             | PASS      | PASS     | PASS      |
| Unused variable detected; used variable absent | PASS      | PASS     | PASS      |
| Delete unused variable via UI                  | PASS      | PASS     | PASS      |
| Deletion verified via API (404)                | PASS      | PASS     | PASS      |
| Cancel a validate-all run                      | PASS      | PASS     | PASS      |
| No unexpected HTTP errors                      | PASS      | PASS     | PASS      |
| No console/page errors                         | PASS      | PASS     | PASS      |
| Rule row link label matches the app menu       | PASS      | PASS     | PASS      |
| Variable row link label matches the app menu   | PASS      | PASS     | PASS      |
| Link opens the object's edit screen            | PASS      | PASS     | PASS      |

The cancel step on 2.41 interrupted a validate-all across all 28 Laos programs
(2699 rules), the heaviest run in the matrix.

## Global shell

The app renders at the top level on 2.41 and inside the global-shell iframe on
2.42 and 2.43; the suite detects the app frame either way. On 2.42/2.43 the
Maintenance deep link is rewritten by the shell to `/apps/maintenance#/edit/...`
and still lands on the object's edit screen.

## Link-out target per version

The link target is resolved at runtime from `GET /api/apps/menu`, which lists
only apps the user may open. The test asserts the button label matches what
that endpoint reports, rather than a hardcoded expectation.

**The Metadata Management app is not bundled in 2.42.6 or 2.43.1.** Enumerating
every bundled app on both instances shows Maintenance present
(`maintenance 32.34.1-v42.0` on 2.42) and `metadata-management` absent. All
three instances therefore resolved to Maintenance, which is the designed
fallback. The Metadata Management branch was verified separately on a 2.41
instance with the app installed from the App Hub, together with the
"neither app available" branch — see the commit message for `c5c8ef26`.

Practical consequence: on a stock 2.42/2.43 instance users get Maintenance
links. Metadata Management links appear only where it has been installed
explicitly.

## Environment notes

- The broker's combined create (`version` + `seed`) failed three times at
  `Dropping existing database...` with no captured stderr, on the 79 MB
  Sierra Leone v42 and 85 MB v43 seeds; the 6 MB EHR seed succeeded. Creating
  with `version` only and then restoring via `POST /instances/<name>/reset`
  restores the same seeds cleanly, and is how the 2.41 and 2.43 instances were
  built.
- Testing ran over plain HTTP inside the sandbox; production is served over
  HTTPS.
