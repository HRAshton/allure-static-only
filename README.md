# allure-static-only

A browser-only host for the upstream Allure frontend with pluggable, client-side report converters. Production deployment consists of static assets served by Nginx (or any static file server), with no API, database, upload service, or report-generation process at runtime.

## Status

Early development through M3: the original pinned Allure 3 Awesome UI has passed browser smoke tests for generated report directories, raw Allure JSON, and raw ZIP results. Broader format, browser, security and deployment support remains on the [roadmap](ROADMAP.md).

## Product constraints

- Reuse the upstream Allure UI through a reproducible, pinned, build-time integration. Do not maintain an upstream fork.
- Parse imported files locally in the browser; never upload test artifacts.
- Extend import support using explicit, versioned converter contracts.
- Keep the production artifact fully static.
- Use small, verified PRs and squash merges into `main`.
- Keep automation inexpensive; avoid workflow spam.

See [ROADMAP.md](ROADMAP.md) for the development stages after initialization.

## Converter extensions

Trusted downstream developers can add a converter at build time by implementing
the **public v1 source-level contract** in `src/sdk/index.ts` and registering
it in `src/extensions/converters.ts`. The import shell then detects compatible
formats automatically, without a private Allure API dependency.

See [Public converter API, examples and Docker integration](docs/CONVERTER-API.md).
Runtime installation of uploaded JavaScript and a published npm SDK are **not**
available. New built-in report formats will follow in later milestones.
