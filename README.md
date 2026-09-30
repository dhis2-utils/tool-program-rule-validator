# Program Rule Validator Tool

> ![Maturity: Validated](https://img.shields.io/badge/maturity-Validated-yellow)  
> Intended use: validate program rule and program rules variables, identifying invalid program rules and unused variables, bulk deleting unused program rule variables.  
> Maintainers: HISP Centre implementation team.
>
> **WARNING**
> This tool is intended to be used by system administrators to perform specific tasks, it is not intended for end users. It is available as a DHIS2 app, but has not been through the same rigorous testing as normal core apps. It should be used with care, and always tested in a development environment.

The app is built with the [DHIS2 App Platform](https://developers.dhis2.org/docs/app-platform/getting-started) (React, `@dhis2/app-runtime`, `@dhis2/ui`) and supports DHIS2 2.40 and later.

## License

© Copyright University of Oslo 2024

## Getting started

### Install dependencies

```
pnpm install
```

### Start the dev server

```
pnpm start
```

This starts the app on http://localhost:3000, connecting to a DHIS2 instance on http://localhost:8080 by default. To develop against a remote instance, use the built-in CORS proxy:

```
pnpm start --proxy https://play.im.dhis2.org/dev-2-43
```

Then log in with the instance credentials at the login screen (use http://localhost:8080 as the server URL when using the proxy).

### Run tests

```
pnpm test
```

### Build a deployable zip

```
pnpm run build
```

The installable app bundle is written to `build/bundle/tool-program-rule-validator-<version>.zip`, which can be installed in DHIS2 via App Management.
