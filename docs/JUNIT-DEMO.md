# JUnit XML imports and GitHub Pages demo

Open the browser-only demo at `https://hrashton.github.io/allure-static-only/` **after GitHub Pages is enabled and its deploy workflow succeeds**.

1. Download [the public sample JUnit XML](../fixtures/demo-junit.xml), or use a JUnit XML report exported from CI.
2. Drag the XML file onto the drop zone, or use **Individual files** and select the XML.
3. Review the original Allure UI: the demo fixture includes 3 passed, 1 failed, 1 broken and 1 skipped testcase, including nested suite grouping. Raw filenames and results remain on your computer.

The demo uses the pinned upstream Allure Awesome frontend with the JUnit converter provided through the documented [public converter API](PUBLIC-CONVERTER-API.md). There is no upload API, report database, JavaScript injection or runtime Node service. The sample is copied into the static build at `demo/junit-sample.xml`; it is not automatically imported when the site loads.

## JUnit XML mapping

- `<testsuite>` and `<testsuites>` roots are supported, including nested suites.
- Every `<testcase>` is an independent test; `classname` is included in `fullName` and package labels, and XML suite names become suite grouping labels.
- `<failure>` becomes **failed**, `<error>` becomes **broken**, `<skipped>` becomes **skipped**; otherwise passed. A failure message is taken from its `message` attribute or text.
- The `time` attribute means seconds and converts to `durationMs`. Missing times are absent rather than fabricated.
- Missing attachments, retries, steps, history, properties, CI/environment metadata and JUnit stdout are not invented. These are not standardly available as native testcase fields in the supported JUnit subset.
- All XML is treated as untrusted data, external DTD/entities are rejected, and input/entry size and testcase count limits are enforced.

## GitHub Pages setup

The repository owner must choose **Settings → Pages → Build and deployment → Source: GitHub Actions**. The workflow `.github/workflows/pages-demo.yml` builds the pinned upstream frontend, validates the JUnit browser smoke, uploads `dist/` and deploys through official Pages actions. On success its site URL is displayed in the deployment summary.

The workflow runs on `main` changes affecting relevant source, build or Pages workflow paths and supports `workflow_dispatch` for manual redeployment. Changing arbitrary non-site documents need not rebuild the expensive upstream Allure monorepo. If deployment fails with “Get Pages site failed,” verify the Pages source in Settings; the workflow token cannot enable Pages automatically without higher administrative credentials.

## Local smoke

```sh
npm ci
npm run verify
npm run upstream:probe
npm run build:upstream
node scripts/prepare-fixture.mjs
node scripts/prepare-m3-fixture.mjs
(cd .allure-workspace/m1-fixture-results && zip -q ../m3-fixture.zip *-result.json)
(cd .allure-workspace/m3-complex-results && zip -q ../m3-complex.zip *)
node scripts/smoke-browser.mjs
```

The Playwright smoke asserts JUnit status counts, suite, duration, escaping and a real Allure UI test leaf. The report import must not make external network requests.

## Coverage policy

Correctness gates (unit, TypeScript/Biome, browser fixture, offline/no-upload tests) are release blockers. Codecov can supplement them with coverage trends and patch coverage, but it cannot substitute for exercising DOMParser, ZIP and UI flows in a real browser. First collect a stable coverage baseline using Node's built-in coverage; then enforce project coverage without penalizing cross-browser-only code and enforce stricter patch coverage on new converter modules. No external Codecov token or required status check is configured by this milestone.


## CTRF JSON in the same demo

The static demo now also offers [a sample CTRF JSON report](../fixtures/demo-ctrf.json). A user can download it and select it through the same **Individual files** control. CTRF runs are identified by `reportFormat: "CTRF"` and a semantic `specVersion`, not by a privileged filename. See [CTRF mapping and limits](CTRF-CONVERTER.md) for implementation details.
