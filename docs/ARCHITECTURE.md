# Architecture and boundary rules

## Runtime dependency graph

```text
shell --> runtime --> converters --> domain
   |         |           |
   v         v           v
allure-adapter ----------> domain
```

- `src/domain`: immutable normalized result types; absolutely no browser, upstream, I/O or third-party imports.
- `src/converters`: versioned portable converter contracts and format-specific adapters; only depends on domain and itself.
- `src/runtime`: format selection and orchestration; may depend on converters and domain; no upstream UI imports.
- `src/allure-adapter`: **only** layer permitted to bind to internal upstream Allure data formats or frontend modules. The documented integration is pinned by upstream commit and must break loudly on drift.
- `src/shell`: browser-facing import controls; orchestrates runtime and adapter but never parses formats.
- `scripts`: build-time tools, which may use Node.js; no scripts run as backend services in production.

`node scripts/check-boundaries.mjs` guards relative TypeScript imports. Keep third-party dependencies minimal; stricter policy checks can be added as real modules appear.

## Invariants

1. Production artifacts are static. No application backend, API, persistence service or report upload.
2. User files never leave their browser. Fetch only the application's own static assets.
3. Upstream Allure must be downloaded at a complete pinned commit SHA at build time, not edited in this repository as a permanent fork.
4. Patch a human-readable upstream interface only. Patch failures are fatal; never patch minified compiled chunks.
5. Every converter has a unique stable ID and `apiVersion`. Detection returns an integer 0..100; ties at maximum confidence are **errors**, not arbitrary choices.
6. Normalized results preserve missing fields and provenance. Rendering data is not a source of truth.
7. Treat all imported bytes, paths, archive entries, attachments, test names and messages as untrusted.
8. Every converter and upstream adapter change requires representative failure fixtures and deterministic tests.

## Compatibility policy

The Allure Awesome UI's data contract is not assumed to be public or stable. The M1 compatibility spike is a release blocker. Do not rewrite Allure's UI to force progress or silently replace it with a similar-looking page.

## Merge policy

One milestone per PR, manual local checks, squash merge only. No GitHub Actions on each push by default. GitHub protections and mandatory external approvals always take priority.

## Public converter SDK boundary (source-level v1)

`src/sdk/index.ts` is the versioned, Allure-independent public converter entry
point. `src/extensions/converters.ts` is its sole build-time registration
manifest. A downstream converter may depend on the SDK and domain types but
not on the private Awesome data adapter. The browser shell imports the compiled
registry at runtime; no arbitrary uploaded script can join it.

See [the public converter API reference](CONVERTER-API.md) for extension,
detection, security, Docker build and compatibility requirements.
