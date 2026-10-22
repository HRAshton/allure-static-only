# @allure-static-only/converter-sdk

**Packable, private M5c SDK candidate. Not published on npm.**

This build-time TypeScript/ESM package exports the versioned public converter
API and normalized report validation from the application's existing
`src/sdk/index.ts`. It does **not** export upstream Allure internals, runtime
parsers, UI adapters or report upload services.

From a clean repository checkout:

```sh
npm ci
npm run build:sdk
npm run test:sdk-package
npm pack ./packages/converter-sdk --dry-run
```

The package test creates a temporary tarball, installs that tarball into an
**independent temporary consumer** with npm network access disabled, imports
the API with Node ESM, exercises a custom converter, and compiles a strict
TypeScript consumer. The temporary installation is removed afterward.

This repository intentionally sets `private: true` on the candidate package,
so a deployment cannot accidentally publish it. Removing that guard and
publishing to a registry are a **separate approval gate**. Verify ownership of
the npm scope, package name, license, provenance, and semver policy before
publication. No npm package availability is claimed.

Trust boundary: custom converters are build-approved source only; do not
execute uploaded JS. The normalized API cannot promise compatibility with
all new upstream Allure versions. Pin the host revision and run end-to-end
adapter acceptance before shipping a custom frontend image.
