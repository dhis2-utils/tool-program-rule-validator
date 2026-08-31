# Version/database test matrix: Program Rule Validator 1.0.0

Tested: 2026-08-27, re-run 2026-08-28 after the link-out fix · Bundle: `tool-pr-validator-1.0.0.zip` installed via `POST /api/apps` and driven with Playwright · Auth: `local_admin`

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
only apps the user may open. The test asserts the button label and tooltip match
what that endpoint reports, rather than a hardcoded expectation.

| Version  | Metadata Management                | Link target resolved |
| -------- | ---------------------------------- | -------------------- |
| 2.41.9.1 | not present (App Hub install only) | Maintenance          |
| 2.42.6   | **not bundled**                    | Maintenance          |
| 2.43.1   | **bundled**, v0.166.1              | Metadata Management  |

Metadata Management is bundled in **2.43 but not 2.42**. The first run of this
matrix reported it absent on both, which was wrong for 2.43: `/api/apps` was
queried moments after boot while bundled apps were still registering, and
returned 29 apps where the settled instance returns 31. Let an instance settle
before treating its app list as complete.

2.42.6 was re-checked on a fresh instance after it had fully settled and is
genuinely without the app: 29 apps, 27 menu modules, no metadata entry, and
`/apps/metadata-management` renders the global shell's "Unable to find an app
for this URL". On 2.43.1 the same URL opens the app.

Finding that wrong reading also exposed two real defects, since fixed:
the bundled app is listed in `apps/menu` as `dhis-web-metadata-management`
rather than `metadata-management`, and it is served from
`{base}/dhis-web-metadata-management/index.html` rather than
`{base}/api/apps/metadata-management/index.html`. The app now matches both
names and takes the launch URL from the menu instead of constructing it.

## Environment notes

- The broker's combined create (`version` + `seed`) failed three times at
  `Dropping existing database...` with no captured stderr, on the 79 MB
  Sierra Leone v42 and 85 MB v43 seeds; the 6 MB EHR seed succeeded. Creating
  with `version` only and then restoring via `POST /instances/<name>/reset`
  restores the same seeds cleanly, and is how the 2.41 and 2.43 instances were
  built.
- Testing ran over plain HTTP inside the sandbox; production is served over
  HTTPS.
