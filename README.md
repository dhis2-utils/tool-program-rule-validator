# Program Rule Validator Tool

> ![Maturity: Validated](https://img.shields.io/badge/maturity-Validated-yellow)  
> Intended use: find invalid program rule expressions and unused program rule variables, and bulk-delete the unused variables.  
> Maintainers: HISP Centre implementation team.

> [!WARNING]
> This tool is for system administrators, not end users. It deletes metadata, and it has not been through the testing of the DHIS2 core apps. Try it on a copy of your database before you use it on a production server.

The tool checks every program rule condition and action expression with the server, lists the ones the server rejects, and lists program rule variables that no rule uses so you can delete them. The user documentation is in [docs/user/](docs/user/tool-program-rule-validator.md).

## Supported DHIS2 versions

2.40 and later (`minDHIS2Version` in `d2.config.js`). The end-to-end suite runs on the last three DHIS2 majors.

## Development

The app is built with the [DHIS2 App Platform](https://developers.dhis2.org/docs/app-platform/getting-started) (React, TypeScript, `@dhis2/app-runtime`, `@dhis2/ui`).

### Prerequisites

- Node.js 22.
- pnpm, in the version that `packageManager` in `package.json` names. Run `corepack enable` to get it.
- A DHIS2 instance to develop against, for example a local one on port 8080. [DHIS2 in Docker](https://developers.dhis2.org/docs/tutorials/dhis2-docker/) explains how to start one.

### Install the dependencies

```bash
pnpm install
```

### Start the app against a local instance

```bash
pnpm start
```

The app runs on http://localhost:3000. Log in with the URL of your DHIS2 instance, such as http://localhost:8080, and its credentials. If the instance does not allow requests from localhost:3000, start the app with the built-in proxy instead, `pnpm start --proxy http://localhost:8080`, and log in with http://localhost:8080 as the server.

### Test, lint and build

```bash
pnpm test                  # unit tests (Jest), next to the code as src/**/*.test.ts
pnpm run lint              # Ultracite: Oxlint and the Oxfmt format check
pnpm exec tsc --noEmit     # typecheck
pnpm run build             # bundle in build/bundle/tool-program-rule-validator-<version>.zip
```

`pnpm run format` formats the code with Oxfmt. The lint setup follows [LINTING.md](https://github.com/dhis2-utils/reference-tool-conventions/blob/main/LINTING.md) of reference-tool-conventions; `AGENTS.md` sums up the house style for coding agents.

The end-to-end suite in [e2e/](e2e/README.md) installs the bundle on a throwaway DHIS2 instance and drives the app in Chromium. It deletes data, so read its README before you run it.

### Release

Bump `version` in `package.json`, add a section to `CHANGELOG.md`, merge to `main`, then push a `vX.Y.Z` tag. The release workflow builds the bundle and attaches it to a GitHub release. The full procedure is in [RELEASE-WORKFLOW.md](https://github.com/dhis2-utils/reference-tool-conventions/blob/main/RELEASE-WORKFLOW.md) of reference-tool-conventions.

## License

BSD-3-Clause. © University of Oslo 2024.
