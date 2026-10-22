# Test coverage and Codecov release gates

**Current state:** strict Biome, TypeScript, unit tests and real Chromium import regressions are mandatory for milestone merges. Before setting coverage thresholds, establish a baseline with:

```sh
npm run coverage
```

This invokes the built-in Node v22 test-runner V8 coverage tool. The M4b verification workflow logs its output without requiring new npm packages, secrets or a Codecov account. It covers Node-executed converter/domain/runtime paths; browser-only DOMParser and the real upstream Allure UI still require Chromium smoke and later Firefox tests. Do not conflate covered statements with secure input handling or end-to-end correctness.

## Proposed Codecov adoption

1. Once a representative Node-plus-browser coverage baseline exists, publish a normalized coverage artifact (LCOV) and connect the repository to [Codecov](https://docs.codecov.com/docs/quick-start). Avoid user-provided tokens in a public Pages demo. Keep coverage private to build workflows if report content becomes sensitive.
2. Start with **informational** project and patch coverage reporting (not a required branch-protection context). Explicitly exclude generated `dist/`, the cloned Allure monorepo, fixtures and the vendor frontend from denominator.
3. Enforce a non-regression **project** gate (baseline-relative with a small margin) once coverage data is reproducible, and a stronger **patch** gate for new converter code. Do not invent a universal 80–90% threshold before measuring the baseline.
4. Configure GitHub branch protection to require Codecov statuses only after action permissions, public repo upload behavior and consistent coverage generation are verified. Missing/unreported coverage must fail rather than silently pass once enforced.

Passing coverage alone is insufficient for release: malformed XML/JSON, ZIP bombs, XSS and attachment paths, large inputs, runtime cancellation, offline/no-report-uploads and Chromium/Firefox smoke remain independent acceptance criteria.

## Baseline from M4b acceptance

The successful [M4b verification run](https://github.com/HRAshton/allure-static-only/actions/runs/39828837410) executed **41 tests** and recorded the native Node coverage summary: **84.92% lines, 83.26% branches, 90.78% functions** across its measured files, including tests. The new CTRF converter itself measured **93.33% lines, 75.42% branches and 95.24% functions**. JUnit's DOMParser implementation was only **43.27% line-covered by Node**, despite passing its Chromium integration test: this demonstrates why a Node-only project-level threshold would be misleading. Establish separate browser coverage before defining a required global Codecov project threshold. These numbers are baselines, not configured checks.
