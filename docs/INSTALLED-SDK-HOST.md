# M5d: installed converter SDK in a real static Allure build

The earlier M5b extension example copied a trusted converter into the host,
while M5c proved that an independent Node/TypeScript consumer could install
the SDK tarball offline. This acceptance combines those boundaries:

1. Build the separate `@allure-static-only/converter-sdk@0.1.0-rc.1`
   candidate distribution from the checked-in public source API.
2. Install its **npm tarball**, offline, inside the clean Docker builder.
   The external converter's type imports resolve from the **installed
   package**, not a relative path into the host source.
3. Copy only the organization's converter and approved registration manifest
   into the static host, validate strict TypeScript and build pinned upstream.
4. Drive the actual original Allure Awesome interface with Chromium using a
   company-specific JSON report, including hostile-looking text and no
   off-origin report requests.
5. Serve the final image with Nginx only, and verify static HTML, JS MIME and
   response CSP headers. No Node runtime or upstream report CLI is deployed.

`import type` disappears from the browser output; the **host** still owns
runtime registry validation, domain models and the upstream adapter. The
installed SDK proves a distributed *type contract*, not arbitrary plugin
loading or a separately deployed JavaScript converter package.

## Compatibility and migration contract

Converter API major version **1** is pinned via `apiVersion: 1` and
`CONVERTER_API_VERSION`. For compatible additions that do not require
existing converters to change, increment the SDK minor version, add tests
and document the new optional fields. Any change that requires adapting a
converter, alters exported types incompatibly or changes report validation
semantics needs a new **major API revision**, a host compatibility matrix,
migration examples and dedicated old/new consumer acceptance. Registry
configuration must reject incompatible API versions rather than silently
adapting a report. A prerelease package may still contain breaking changes;
pin the exact prerelease when testing a downstream converter.

Before a package is actually published, verify scope ownership,
licensing/provenance and the publishing actor's authorization. The candidate
still sets `private: true` and has **not been uploaded to npm**. Removing
that guard or publishing a GitHub release is not part of M5d.

## Remaining RC1 checks

Manual screen-reader verification, malicious binary attachment preview
testing, complete license notices and two-build reproducibility, final
release versions, enforceable required checks and npm publication approval
remain separate. The test is a clean real static host Docker build, but
offline tarball packaging is **not public registry availability**.
