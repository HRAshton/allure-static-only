# Downstream converter: clean static Docker build

**Purpose:** prove that an organization can maintain a trusted converter in its own source tree, overlay it at image build time, and deploy **only static Nginx assets**. Neither the runtime shell nor the upstream Allure 3 frontend is patched. A published npm SDK and dynamically installed plugins remain out of scope.

## Example files

- `examples/company-adapter/converter.ts` — separately maintained source adapter implementing **public API v1**; no private Allure imports.
- `examples/company-adapter/converters.ts` — full build-time registration manifest listing the three default converters plus the external one.
- `examples/company-adapter/example.company.json` — simulated organization report. It includes a deliberately suspicious test name to verify UI text escaping.
- `examples/company-adapter/Dockerfile` — executable multistage build, including strict source verification and Chromium integration using `scripts/smoke-external-adapter.mjs`.

This is a **source-overlay** extension, not a separately published npm package. Both the external source folder and the destination folder are two path segments below the repo root, so `../../src/sdk/index.ts` type imports compile unchanged when copied. In a real downstream project, the converter source and manifest can come from another Git checkout placed inside the Docker build context, or be copied in by a Git submodule or build pipeline. The host does not execute arbitrary JS uploaded with test reports.

## Build

From repository root (requires Docker, network access to npm/GitHub and sufficient storage to compile pinned upstream Allure):

```sh
docker build -f examples/company-adapter/Dockerfile -t allure-static-custom .
docker run --rm -p 8080:80 allure-static-custom
```

Then open `http://localhost:8080/`, choose **Individual files**, and select `examples/company-adapter/example.company.json`. The original Allure frontend should display one passed, one failed and one skipped case in **External adapter demo**. The built custom image additionally exposes `/demo/company-sample.json` for downloading a report; it does not import it automatically.

The build runs Biome, TypeScript, unit tests, the pinned upstream Allure build and an **actual Chromium import** with the external converter. The final image is the `nginx:alpine` runtime stage with copied `dist/` only, **not Node, Yarn, Chromium or source report files used in build** (the intentionally public sample is copied to `dist/demo/`).

### Why a manifest overlay?

`src/config/converters.ts` is the documented registry entry point. The downstream manifest **replaces that one file** and adds the adapter to `src/extensions/`. It does not modify the core SDK contract, domain model, Awesome adapter or shell. The main application can be updated independently while this adapter continues to implement API major version 1.

Do not use dynamic import of user-provided JS or a report upload API; the converter's JavaScript is trusted at image build time. If a converter needs more Allure features than the current normalized v1 model, file an explicit API feature request rather than depending on private Awesome JSON.

## CI acceptance

The temporary M5b acceptance workflow builds this Dockerfile from a **clean Git checkout**, runs the custom adapter's Chromium smoke *inside the builder*, starts the final Nginx image and checks HTML, compiled ESM, the downloadable fixture and absence of a Node runtime. It also exercises the SDK contract in the normal Node unit test suite.

The test demonstrates compile-and-run integration of a separately organized source adapter. It does **not** establish published npm package semver compatibility, browser cross-vendor support, a complete security audit, or production image vulnerability scanning. Those are distinct RC gates.

## Acceptance evidence

Source-level and clean-container gates both passed in the [M5b GitHub Actions run](https://github.com/HRAshton/allure-static-only/actions/runs/39832471711). The container test executes a Chromium import against the true pinned Allure Awesome UI, checks 1 passed / 1 failed / 1 skipped custom results, confirms suspicious test names remain data, audits outgoing requests, and verifies the final Nginx-only image and static asset paths. The temporary branch-only workflow was excluded from the merged source tree to keep routine CI cost low.
