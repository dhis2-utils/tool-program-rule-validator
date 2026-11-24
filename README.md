# Program Rule Validator Tool

> ![Maturity: Validated](https://img.shields.io/badge/maturity-Validated-yellow)  
> Intended use: find invalid program rule expressions and unused program rule variables, and delete unused variables in bulk.  
> Maintainers: HISP Centre implementation team.

> [!WARNING]
> This tool is for system administrators. It deletes metadata, and it has not had the testing that the DHIS2 core apps have. Try it on a copy of your database before you use it on a production server.

The Program Rule Validator Tool checks the program rules in a DHIS2 instance for invalid conditions and action expressions, and finds program rule variables that no rule uses. The user documentation is in [docs/user/](docs/user/tool-program-rule-validator.md).

The rest of this README is for developers. The tool is a [DHIS2 App Platform](https://developers.dhis2.org/docs/app-platform/getting-started) app (React, TypeScript, `@dhis2/app-runtime` and `@dhis2/ui`).

## Supported DHIS2 versions

DHIS2 v41 and later (`minDHIS2Version` in `d2.config.js`), the DHIS2 versions that are still supported. The end-to-end suite runs against v41, v42 and v43.

## Prerequisites

- Node.js 22.
- pnpm, in the version that `packageManager` in `package.json` names. Run `corepack enable` to get it.
- A DHIS2 instance to run the tool against. To start one on your computer, see [DHIS2 in Docker](https://developers.dhis2.org/docs/tutorials/dhis2-docker/).
- For the end-to-end suite: Python 3 and Playwright (see [e2e/README.md](e2e/README.md)).

## Install the dependencies

```bash
pnpm install
```

## Start the tool against a local instance

```bash
pnpm start
```

The tool opens on http://localhost:3000. Log in with the URL of your instance, for example http://localhost:8080, and a user on that instance.

The instance must allow requests from http://localhost:3000. If it does not, add that address to the CORS allowlist of the instance, or start the tool with the built-in proxy and log in with http://localhost:8081 as the server URL:

```bash
pnpm start --proxy http://localhost:8080 --proxyPort 8081
```

## Test, lint and build

```bash
pnpm test                 # unit tests (Jest), next to the code in src/
pnpm run lint             # Ultracite: Oxlint and the Oxfmt format check
pnpm run format           # format with Oxfmt
pnpm exec tsc --noEmit    # type check
pnpm run build            # writes build/bundle/tool-program-rule-validator-<version>.zip
```

Linting follows [LINTING.md](https://github.com/dhis2-utils/reference-tool-conventions/blob/main/LINTING.md) in reference-tool-conventions: Ultracite on Oxlint and Oxfmt, over the DHIS2 house style. `AGENTS.md` repeats the rules for coding agents.

The end-to-end suite installs the built zip on a throwaway DHIS2 instance and drives it in a browser. See [e2e/README.md](e2e/README.md).

## Release the tool

Releases follow [RELEASE-WORKFLOW.md](https://github.com/dhis2-utils/reference-tool-conventions/blob/main/RELEASE-WORKFLOW.md) in reference-tool-conventions:

1. Change `version` in `package.json`, and add a `## [x.y.z]` section at the top of `CHANGELOG.md`.
2. Merge to `main`, and wait for CI to pass.
3. Tag the merged commit, `git tag vx.y.z`, and push the tag.

The release workflow builds the zip and attaches it to a GitHub release, with the changelog section as the release notes.

## License

BSD-3-Clause. See [LICENSE](LICENSE).
