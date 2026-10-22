# allure-static-only

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/HRAshton/allure-static-only/badge)](https://scorecard.dev/viewer/?uri=github.com/HRAshton/allure-static-only)

A browser-only host for the **upstream Allure Awesome frontend** with build-approved, client-side report converters. Production deployment consists exclusively of static HTML, CSS, JavaScript and assets served by Nginx (or any static file server). Reports never need to be uploaded to a backend.

## Status

M0–M3 have passed their milestone checks: the real upstream Allure 3 UI renders generated Awesome report directories and browser-imported raw `allure-results` JSON/ZIP files. JUnit XML support and the GitHub Pages demo are available; CTRF JSON is supported through the same public converter API and demo. The [roadmap](ROADMAP.md) describes remaining converters, hardening and the release-candidate gates. This repository is not a published npm SDK or a release-candidate-quality production distribution.

## Public converter API (v1)

**[Read the public API and build-time integration guide](docs/PUBLIC-CONVERTER-API.md).**

The versioned TypeScript contract lives in `src/sdk/index.ts`. A trusted adapter implements `ReportConverter`, returns the normalized `TestReport`, and is registered in `src/config/converters.ts` with `defineConverters`. The build then bundles it into the static frontend. The converter does not import Allure internals or change the upstream UI.

A **clean Docker source-overlay integration** is available in [examples/company-adapter](examples/company-adapter/) with a [step-by-step verified build guide](docs/EXTERNAL-CONVERTER-BUILD.md). It compiles a separately organized trusted converter into the static frontend, tests its import in Chromium and runs Nginx only in production. A published npm SDK remains future work.

Built-in native Allure results and JUnit XML converters are registered. CTRF JSON support is being verified in M4b. Additional format implementations are scheduled separately. Uploaded JavaScript modules and unreviewed runtime plugin execution are **not supported**.

```sh
npm ci
npm run verify
npm run build:upstream
```

For a Docker multistage build, custom adapters and their build-time registry should be copied **before** verification and build. See the guide for the full example.

## Product constraints

- Reuse pinned upstream Allure UI; do not maintain a permanent upstream fork.
- Parse user-supplied reports only in the browser; no upload endpoint or runtime CLI.
- Accept extensions through a versioned, explicit converter registry.
- Reject ambiguous detection and untrusted paths or oversized archive entries.
- Keep production entirely static and use reproducible milestone verification.

See [ROADMAP.md](ROADMAP.md) for milestones and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for dependency rules.
