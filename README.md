# allure-static-only

A browser-only host for the upstream Allure frontend with pluggable, client-side report converters. Production deployment consists of static assets served by Nginx (or any static file server), with no API, database, upload service, or report-generation process at runtime.

## Status

Early development. The [roadmap](ROADMAP.md) defines the acceptance gates to a release candidate. Until an upstream Allure integration is demonstrated, no claim is made that the native Allure UI can load arbitrary raw results.

## Product constraints

- Reuse the upstream Allure UI through a reproducible, pinned, build-time integration. Do not maintain an upstream fork.
- Parse imported files locally in the browser; never upload test artifacts.
- Extend import support using explicit, versioned converter contracts.
- Keep the production artifact fully static.
- Use small, verified PRs and squash merges into `main`.
- Keep automation inexpensive; avoid workflow spam.

See [ROADMAP.md](ROADMAP.md) for the development stages after initialization.
