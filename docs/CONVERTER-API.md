# Public converter API: version 1 (source-level preview)

This document is the public contract for **trusted, build-bundled report format converters**
in `allure-static-only`. Additional built-in report formats will be implemented later.
The source-level API is usable now; a published standalone npm SDK, a runtime plugin
marketplace, and dynamic loading of user-uploaded JavaScript **do not exist**.

## Architecture and guarantees

A converter implements `ReportConverter`, a small TypeScript interface defined at
[`src/sdk/index.ts`](../src/sdk/index.ts). It reads user-selected files, detects its
own format, and returns a normalized `TestReport`. The shared adapter subsequently
maps that data into the pinned **original Allure 3 Awesome frontend**.

```text
Local File(s) / ZIP
    -> validated ReportInput[]
    -> detect() in the build-approved converter registry
    -> convert() -> immutable TestReport
    -> internal Awesome widget/attachment adapter
    -> upstream Allure UI (static files only)
```

No converter should need to import Allure framework, webpack bundles, or Awesome
widget types. These are **private, version-pinned integration details**. Browser
input is never uploaded to a report-processing service.

## Public imports

At present the public entry point is **source-level**, `src/sdk/index.ts`, and
extensions must be compiled with the application. The following exports are supported:

| Export | Purpose |
| --- | --- |
| `CONVERTER_API_VERSION` | Runtime literal `1` |
| `ReportInput` | Validated file port with `path`, `byteLength`, optional `mimeType` and asynchronous `read()` |
| `Cancellation` | Cancellation token exposing `isCancelled()` |
| `ReportConverter` | `id`, `apiVersion`, `extensions`, `detect()`, `convert()` |
| `defineConverters()` | Validates and freezes the build-approved registry |
| `ConverterConfiguration` | Readonly registry type |
| `TestReport`, `TestCase`, `ReportStep`, `ReportAttachment`, `TestStatus` | Framework-independent result model |

The package is currently private and has **no npm `exports` SDK specifier**.
Imports such as `allure-static-only/sdk` do not work yet. Use relative imports
inside a checkout as described below. A published package needs an explicit
release, export map, and compatibility policy.

### Converter contract

```ts
interface ReportConverter {
  readonly id: string;
  readonly apiVersion: 1;
  readonly extensions: readonly string[];

  detect(inputs: readonly ReportInput[]): Promise<number>;
  convert(
    inputs: readonly ReportInput[],
    cancellation: Cancellation,
  ): Promise<TestReport>;
}
```

- `id`: unique stable lowercase identifier, beginning with a letter; later
  components may contain lowercase letters, digits, `-`, `.`, or `_`.
- `apiVersion`: exactly `1`. Incompatible converter versions fail at
  registration; avoid duplicating the literal version in multiple sources.
- `extensions`: nonempty lowercase filename suffixes such as `[".json"]`,
  `[".xml"]`, or the built-in Allure suffix `["-result.json"]`. These are
  declarative hints, **not** proof of format.
- `detect()`: returns a **Promise** of integer confidence `0..100`.
  `0` means unsupported. Inspect file names and bytes as needed; avoid
  expensive full parsing during detection.
- `convert()`: returns a **Promise** of an immutable `TestReport`. Reject
  malformed or truncated input with useful error messages. Check cancellation
  during lengthy parsing and before additional reads.
- The registry refuses duplicate IDs, invalid suffixes, missing functions
  and unsupported versions. Highest nonzero confidence wins. Equal top scores
  throw `AmbiguousReportError`; zero matches throw `UnsupportedReportError`.
  Extension overlap is allowed if detection unambiguously distinguishes formats.

`ReportInput.path` is a normalized **relative** logical path, not an absolute
filesystem path or a URL. `byteLength` is the source size. `read()` returns
a `Uint8Array` and may be called asynchronously. The platform supplies input
limits and cancellation between reads.

### The normalized result model

```ts
interface TestReport {
  readonly id: string;
  readonly sourceFormat: string;
  readonly name?: string;
  readonly generatedAt?: string;
  readonly tests: readonly TestCase[];
}

interface TestCase {
  readonly id: string;
  readonly name: string;
  readonly historyId?: string;
  readonly startMs?: number;
  readonly stopMs?: number;
  readonly status: "passed" | "failed" | "broken" | "skipped" | "unknown";
  readonly durationMs?: number;
  readonly fullName?: string;
  readonly message?: string;
  readonly labels: Readonly<Record<string, readonly string[]>>;
  readonly steps: readonly ReportStep[];
  readonly attachments: readonly ReportAttachment[];
}
```

Nested steps follow `ReportStep` (`name`, `status`, `durationMs?`,
`steps`, `attachments`). Attachments use `name`, relative `sourcePath`,
and optional `mimeType`. Source-file attachment bytes must be present among
the selected files; missing or ambiguous references are rejected.

Do not manufacture missing timestamps or synthetic test statuses. A converter
should document any unavoidable information loss. The current normalized model
does **not** carry every upstream Allure feature (e.g. CI/Git metadata,
categories, quality gates, metrics, setup/teardown and full multi-report
history); expanding those needs separately versioned model changes.

## Adding a trusted converter

1. Place the source at, for example,
   `src/converters/company/company-json.ts`.
2. Import its public types from `../../sdk/index.ts`, **not**
   `../../allure-adapter/awesome-data.ts`.
3. Register it once in `src/extensions/converters.ts`.
4. Run `npm ci && npm run verify && npm run build:upstream`.
5. Import a representative report in Chromium and check that the original
   Allure UI renders the intended result without network upload.

Example implementation inside `src/converters/company/company-json.ts`:

```ts
import type { ReportConverter, TestReport } from "../../sdk/index.ts";

export const companyJsonConverter: ReportConverter = {
  id: "company-json",
  apiVersion: 1,
  extensions: [".json"],

  async detect(inputs) {
    return inputs.some((input) => input.path.endsWith(".company.json")) ? 90 : 0;
  },

  async convert(inputs, cancellation): Promise<TestReport> {
    const input = inputs.find((item) => item.path.endsWith(".company.json"));
    if (!input) throw new Error("Expected a company JSON result.");
    if (cancellation.isCancelled()) throw new Error("Import cancelled.");

    const contents = await input.read();
    if (cancellation.isCancelled()) throw new Error("Import cancelled.");
    const raw: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(contents));
    if (!raw || typeof raw !== "object" || !("caseName" in raw) ||
      typeof raw.caseName !== "string") {
      throw new Error("Invalid company JSON report.");
    }

    return {
      id: "company-report",
      sourceFormat: "company-json",
      tests: [{
        id: "case-1",
        name: raw.caseName,
        status: "passed",
        labels: {},
        steps: [],
        attachments: [],
      }],
    };
  },
};
```

The example above is deliberately illustrative: a real converter must validate
every required source field, report correct statuses and timestamps, and avoid
inventing a successful result if the source format does not contain that fact.

Replace `src/extensions/converters.ts` with:

```ts
import { allureResultsConverter } from "../converters/allure-results.ts";
import { companyJsonConverter } from "../converters/company/company-json.ts";
import { defineConverters } from "../sdk/index.ts";

export default defineConverters({
  converters: [allureResultsConverter, companyJsonConverter],
});
```

No edits to the browser import shell or to upstream Allure are necessary.
The registry is compiled to `dist/app/extensions/converters.js`; the shell
loads it by the same-origin module URL when a user selects report files.
The frontend is still browser-only. Do not use import-time browser globals in
a converter: `node --experimental-strip-types` imports the manifest in unit
tests, as does the browser runtime.

### Docker build-time distribution

Downstream teams may fork the repository and copy reviewed source/registry
files as part of a multi-stage Docker build:

```dockerfile
FROM node:22.16.0-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends git \\
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
COPY company-converter/ ./src/converters/company/
COPY company-converters.config.ts ./src/extensions/converters.ts
RUN npm ci && npm run verify && npm run build:upstream

FROM nginx:alpine
COPY deployment/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
```

This Dockerfile is a **reference snippet**, not a currently published or
deployment-tested image. The upstream build downloads the pinned Allure source
and uses Yarn/Node **only during image construction**. The runtime image serves
static assets. Do not copy untrusted uploaded JavaScript into a converter
registry, and do not use a Node conversion server at runtime.

## Compatibility and security policy

- `apiVersion: 1` describes the source contract. Until `v0.1.0-rc.1`,
  this is a documented preview rather than a separately published, semver-stable
  `@.../sdk` npm package. Changes to these declarations must be explicit,
  reviewed and accompanied by compatibility tests.
- The version of upstream Allure is pinned separately in
  [`upstream.lock.json`](../upstream.lock.json). The public converter
  contract intentionally does not expose its widgets, globals, DOM or routes.
- Do not execute JavaScript from uploaded files. Third-party converters are
  **trusted build-time code**, audited like any other application dependency.
- Avoid DOM/script injection and executable HTML attachments; prefer inert text
  and validated binary references. Imported files remain local.
- File-size, archive and step-count limits apply; workers, performance budget
  and cross-browser matrices remain later release-candidate gates.
- If adding a format would require fields absent from `TestReport`, propose a
  model/API update and tests rather than smuggling private Awesome widget
  properties into a converter.

## Testing checklist

- Registry rejects duplicate IDs, wrong versions and malformed declarations.
- A custom converter can run through `importBrowserReport` without modifying
  the shell; unknown formats and ambiguous detection fail predictably.
- Complete `npm run verify` and `npm run build:upstream`.
- Chromium smoke still imports native Allure JSON/ZIP and a generated Awesome
  directory with no report uploads.
- A downstream converter's own fixtures should cover valid, corrupt, oversized,
  cancelled, ambiguous and attachment-containing reports.
