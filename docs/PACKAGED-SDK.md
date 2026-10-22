# M5c: packable standalone converter SDK candidate

`@allure-static-only/converter-sdk@0.1.0-rc.1` is a proposed package
identifier and version, not a claim that any npm registry entry exists.

The SDK is emitted from the same `src/sdk/index.ts` contract used by the
production static Allure host. The source remains the single source of truth
for types, registry validation and normalized report validation. TypeScript
5.8 rewrites relative `.ts` imports to emitted `.js` so the packed ESM
does not depend on a TypeScript runtime. Source-level API v1 is unchanged.

## Acceptance

```sh
npm ci
npm run verify
npm run build:sdk
npm run test:sdk-package
```

`test:sdk-package` runs `npm pack`, installs the tarball into an independent
temporary consumer using `npm install --offline`, checks package boundaries,
validates ESM registry behavior and compiles consumer TypeScript types in
strict NodeNext mode. The package includes no upstream UI bundle or Node
runtime server. It has no third-party runtime dependencies.

## Publication and downstream build gates

This candidate intentionally has `private: true`. It is **not** published
and is not a separately versioned package available on npm. Before removing
that guard, verify npm scope ownership, project licensing, supply-chain
provenance and package name availability. The existing Docker source-overlay
acceptance is not equivalent to using an installed npm distribution inside
the real Allure host: clean host integration of a packaged converter remains
a separate test and release gate. Published SDK compatibility requires an
explicit semver policy and migration documentation. Do not tag RC1 on the
basis of this package smoke alone.
