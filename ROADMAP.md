# Roadmap to v0.1.0-rc.1

## Product contract

**Goal:** serve the **existing upstream Allure Awesome frontend** as a static site while importing raw test results through **pluggable converters running entirely in the browser**. The deployed app requires only Nginx or an equivalent static server. Building may use Node.js and upstream build tools; using a CLI/server to convert a user's report at runtime is **not** acceptable.

**Not goals:** replacing the Allure UI with a lookalike; changing upstream's source permanently in a maintained fork; remote storage; hosted report processing; support for arbitrary non-machine-readable reports; untrusted arbitrary code execution.

The upstream Allure interface and its data contracts are private implementation details. Do not claim that this project works with a new upstream release until its pinned version passes the complete integration suite.

## Architecture decisions (mandatory)

1. **Upstream as input, not a fork.** Pin a full upstream git commit hash; fetch to an ignored build workspace; apply a small, reviewed patch at a documented UI/data boundary; build into the static artifact. The build MUST fail on patch drift, never silently edit minified bundles.
2. **Runtime = browser only.** No backend calls for uploads, parsing, conversion, analytics or synchronization. All file reads use browser APIs; long conversions belong in Workers. Bundle local assets and configure a restrictive CSP when feasible.
3. **Explicit ports and adapters.** `domain/` owns immutable normalized models; `converters/` owns format-specific parsers; `runtime/` owns detection, routing, cancellation, limits and file IO; `allure-adapter/` owns translation to upstream's current UI contract; `shell/` owns the import interface. Converters MUST NOT import Allure UI modules, and domain MUST NOT depend on browser APIs or parsing libraries.
4. **Versioned converter API.** Each converter declares `id`, `apiVersion`, accepted MIME/extensions, `detect`, and `convert`; collisions are deterministically resolved and ambiguous formats reported. Result validation must reject malformed data. “Attachable” initially means build-time modules; runtime third-party plugin execution is a separate security-gated milestone.
5. **Untrusted inputs.** HTML/JS in artifacts is inert, text is escaped, local URLs are bounded and revoked, ZIP bombs/path traversal are rejected, and resources have size/count limits. Never eval user-supplied code.
6. **Strict TypeScript and Biome.** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, no unjustified `any`, no ignored check failures. Unit/integration tests for each converter and the adapter; fixtures are sanitized.
7. **Reproducible releases.** Lock dependencies and upstream revision; record provenance/licensing; build from clean checkout; static Nginx smoke test. Do not silently update upstream.

## Milestones

Every milestone is one focused branch and one PR into `main`, then **squash merge** after acceptance checks. An incomplete milestone remains open and is not represented as complete.

### M0: Guardrails and project skeleton
- Add Biome, strict TypeScript, a lockfile, package scripts, architecture/coding/security docs and contributor conventions.
- Define dependency-direction checks and a lightweight test runner.
- No GitHub Actions on each push; local checks run before merging.
- **Exit:** clean clone installs deterministically; `npm run check`, `npm run typecheck` and `npm test` pass.

### M1: Upstream feasibility gate (risk blocker)
- Pin a tested Allure 3 commit; document exact package path, license and build prerequisites.
- Build the unmodified upstream Awesome frontend, identify its data-loading seam and create a minimal reproducible adapter patch with no minified modifications.
- Replace one fixture's static data read with an in-memory/browser-supplied data source; test a real Allure UI rendering under static hosting.
- **Exit:** upstream UI displays a test fixture in-browser, without runtime Node, API or report-generation CLI. Failure => document blocker and stop expansion; do not substitute a custom UI.

### M2: Browser-local import pipeline
- Drag/drop and file chooser for multiple files, directory support when available, explicit errors.
- Input manifests, cancellation, stable progress, worker isolation where practical, limits on files/bytes/time.
- **Exit:** no report files transmitted over network; corrupted/oversize files fail safely; network trace confirms only local static assets are requested.

### M3: Native Allure converter
- Import raw `allure-results` directory/ZIP, normalize tests/steps/attachments/labels/retries; connect to the upstream UI adapter.
- **Exit:** representative passing/failing/skipped tests, steps, screenshots and malformed-file fixtures render as expected; browser and generated Allure reference views are compared.

### M4: Cross-format converters
- Independent adapters for JUnit XML and CTRF JSON; add Playwright JSON if its data model can be mapped losslessly enough.
- Document information-loss rules; preserve provenance and missing fields.
- **Exit:** fixture-driven tests, deterministic auto-detection, errors on ambiguous input, no silent missing-field fabrication.

### M5: Attachable converter contract
- Publish a versioned TypeScript converter SDK; documented registration and an example external converter package.
- Prefer bundled adapters initially. Evaluate dynamic import of **trusted build-approved** modules; do not accept arbitrary uploaded JS.
- **Exit:** adding a sample converter requires no edits to domain or upstream adapter, and incompatibilities fail with actionable errors.

### M6: Hardening and accessibility
- HTML/script injection checks; ZIP bombs and traversal tests; file/attachment URL cleanup; large-file budget.
- Keyboard operation, mobile-friendly import and UI, error feedback, loading/cancel states.
- **Exit:** security and performance benchmarks documented; static hosting with restrictive headers verified.

### M7: Release candidate v0.1.0-rc.1
- Freeze versions, upstream SHA, converters and documented browser support.
- Produce static `dist/`, Nginx example, SHA256 checksums, attribution/NOTICE and reproducible build instructions.
- Final acceptance matrix: unit, integration, browser smoke (Chromium/Firefox at minimum), offline import, CSP, no network report uploads, clean-clone build, upstream fixture rendering.
- **Exit:** release candidate tag only when all gates pass; otherwise publish a precise blocker list.

## Work policy

- Branch names: `milestone/m0-guardrails`, `milestone/m1-upstream`, etc.
- PR body: scope, acceptance evidence, tests run, security impact, upstream compatibility and rollback notes.
- Squash-only merges when possible; never force-push `main` or bypass protections.
- Keep PRs narrow. Tests must be green before merge; where GitHub protections require external approval, stop and record the blocker.
- **Minimal GitHub Actions:** none in M0; introduce at most one manual `workflow_dispatch` verification workflow after a proven need. Never run a build matrix on every push/PR, and avoid repeated pushes by batching related edits.
- Push only on meaningful milestone completion. Do not publish a release on every merge.

## Release candidate success criteria

A user opens a site served solely by Nginx, supplies raw Allure/CTRF/JUnit reports, sees them through the *real upstream Allure UI*, and can add a preapproved converter without rebuilding or forking Allure itself. A backend is never contacted with the imported data. All source and dependencies are traceable.

## Risk register

| Risk | Mitigation |
| --- | --- |
| Upstream UI tied to generated files/URLs | M1 spike precedes converter development; pin SHA and keep patch minimal |
| Upstream internal API churn | Adapter isolated and compatibility tests tied to upstream SHA |
| Dynamic plugins run arbitrary JavaScript | Trusted build-approved modules first; document threat model for any later runtime loading |
| Large ZIPs exhaust browser memory | Size/entry/decompression limits, streaming/Workers where possible |
| Untrusted report HTML runs scripts | Sanitize/escape, strict CSP and attachment isolation |
| “No server” confused with “no build tools” | Explicitly permit Node at build time; prohibit runtime processing services |
