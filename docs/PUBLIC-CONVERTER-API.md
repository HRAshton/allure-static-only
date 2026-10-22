# Public converter API v1

**Status:** build-time source API (first foundation of M5). Additional report formats, a published SDK package, and fully external adapter packaging are scheduled separately. This API is available **in this repository**, not as an npm package named `allure-static-only/sdk`. Pin a known repository revision when writing extensions.

This guide describes how to add **trusted, reviewed converter code** to a custom static build. Do not execute JavaScript supplied by report upload or import, and do not use a runtime transformation service.

## High-level contract

```text
Browser File / directory / supported ZIP
  -> file limits + safe path normalization
  -> registered ReportConverter.detect (0–100)
  -> ReportConverter.convert + Cancellation
  -> validated, framework-independent TestReport
  -> internal pinned Awesome widget/data adapter
  -> actual upstream Allure Awesome frontend
```

The supported extension surface is:

- `src/sdk/index.ts`: `CONVERTER_API_VERSION`, `ReportInput`, `Cancellation`, `ReportConverter`, `TestReport`, `TestCase`, `ReportStep`, `ReportAttachment`, `TestStatus`, `ConverterRegistry`, `defineConverters`, `validateTestReport`.
- `src/config/converters.ts`: **the only registration file** a custom build needs to edit.
- `src/extensions/`: suggested location for trusted, separately maintained converter code. This folder is intentionally optional and empty in the default build.

These are **not** public extension APIs: `src/allure-adapter/`, `src/shell/`, `src/runtime/`, the global `window.allureReportData`, and upstream Awesome's internal widget schema. Importing them couples an extension to the internal implementation rather than API v1.

### Converter interface

```ts
export interface ReportInput {
  readonly path: string;            // normalized relative path within imported files
  readonly byteLength: number;      // size of this input
  readonly mimeType?: string;       // browser-provided, untrusted metadata
  read(): Promise<Uint8Array>;      // local bytes; never a network URL
}

export interface Cancellation {
  readonly isCancelled: () => boolean;
}

export interface ReportConverter {
  readonly id: string;              // unique lowercase slug: a-z, 0-9, dot, underscore, hyphen
  readonly apiVersion: 1;
  readonly extensions: readonly string[]; // nonempty format hints; not automatic matching
  detect(inputs: readonly ReportInput[]): Promise<number>; // integer 0..100
  convert(
    inputs: readonly ReportInput[],
    cancellation: Cancellation,
  ): Promise<TestReport>;
}
```

`detect()` must not throw merely because the input belongs to a different format; return `0` instead. Higher positive scores win. Two converters tied at the highest positive confidence cause an **`AmbiguousReportError`**: the import fails rather than randomly picking one. If no converter matches, users get an `UnsupportedReportError`. Reject corrupt files during `convert()` with a descriptive error.

Detection need not read file contents, but may inspect bytes using `ReportInput.read()`. `extensions` is currently declarative documentation/registration metadata: the host uses **the detection score**, not file suffix alone, to select a converter. Inputs may contain ancillary files or attachments; converters should filter their own expected entries.

`Cancellation.isCancelled()` must be checked before and after awaited file reads and inside long conversion loops. Conversion must run entirely in the browser; do not call `fetch()`, XHR, remote APIs, `eval()` or the upstream Allure CLI with user data.

### Normalized model

```ts
export type TestStatus = "passed" | "failed" | "broken" | "skipped" | "unknown";

export interface ReportAttachment {
  readonly name: string;
  readonly sourcePath: string; // safe relative path of an imported file
  readonly mimeType?: string;  // preview not guaranteed
}

export interface ReportStep {
  readonly name: string;
  readonly status: TestStatus;
  readonly durationMs?: number;
  readonly steps: readonly ReportStep[];
  readonly attachments: readonly ReportAttachment[];
}

export interface TestCase {
  readonly id: string;                  // unique within this imported report
  readonly name: string;
  readonly historyId?: string;          // same ID groups previous attempts as retries
  readonly startMs?: number;            // Unix epoch milliseconds
  readonly stopMs?: number;             // Unix epoch milliseconds
  readonly status: TestStatus;
  readonly durationMs?: number;
  readonly fullName?: string;
  readonly message?: string;            // failure / status detail
  readonly labels: Readonly<Record<string, readonly string[]>>;
  readonly steps: readonly ReportStep[];
  readonly attachments: readonly ReportAttachment[];
}

export interface TestReport {
  readonly id: string;
  readonly tests: readonly TestCase[];
  readonly sourceFormat: string;        // e.g. "company-json"
  readonly name?: string;
  readonly generatedAt?: string;        // provenance; not interpreted as a timestamp by Awesome
}
```

Do not fabricate absent durations, timestamps, steps, failures or labels. `durationMs` and `startMs`/`stopMs` are different: the latter are Unix epoch timestamps in **milliseconds**, not seconds. Each `labels` value is an array, even if it contains one item (e.g. `{ suite: ["checkout"] }`). `historyId` is optional; tests with different histories are not merged. Imported paths are not system filesystem paths. For attachment references, use paths within the same selected directory or ZIP, not a URL or local absolute path.

The runtime checks the converted report before generating Awesome data. The current validation requires finite nonnegative timing values, known statuses, unique nonempty test IDs, structured labels, steps and attachments, and safe attachment paths. It caps test count at 2,000 and steps at 10,000 per test with a nesting bound. Additional limits apply to input bytes and ZIP extraction. Schema validity does **not** guarantee that every upstream Allure feature is mapped.

### Registration

`src/config/converters.ts` ships with built-in Allure and JUnit XML converters:

```ts
import { allureResultsConverter } from "../converters/allure-results.ts";
import { junitXmlConverter } from "../converters/junit-xml.ts";
import { defineConverters } from "../sdk/index.ts";

export default defineConverters({
  apiVersion: 1,
  converters: [allureResultsConverter, junitXmlConverter],
});
```

An organization can copy a trusted module to `src/extensions/company-results.ts` and register it without touching the UI, domain model or Awesome adapter:

```ts
import { allureResultsConverter } from "../converters/allure-results.ts";
import { companyConverter } from "../extensions/company-results.ts";
import { defineConverters } from "../sdk/index.ts";

export default defineConverters({
  apiVersion: 1,
  converters: [allureResultsConverter, companyConverter],
});
```

The registry validates compatibility, unique converter IDs, required methods and extension hints. It freezes **membership**, not the internals of individual converter instances. Builds should run `npm run verify` so custom registries are imported and validated before deployment. The TypeScript build compiles the registry and imported trusted converter modules into `dist/app/`; the browser imports that emitted module at runtime. The server serves it as static JavaScript.

### Minimal converter skeleton (documentation only)

The following is an *illustrative* trusted converter for `*.company.json`. It is not included in the default build. Real implementations should cover schema failures and limits with fixture tests.

```ts
// src/extensions/company-results.ts
import type {
  Cancellation,
  ReportConverter,
  ReportInput,
  TestCase,
  TestReport,
} from "../sdk/index.ts";

const matches = (input: ReportInput) => input.path.endsWith(".company.json");

export const companyConverter: ReportConverter = {
  id: "company-json",
  apiVersion: 1,
  extensions: [".company.json"],

  async detect(inputs) {
    return inputs.some(matches) ? 95 : 0;
  },

  async convert(inputs, cancellation: Cancellation): Promise<TestReport> {
    const tests: TestCase[] = [];
    for (const input of inputs.filter(matches)) {
      if (cancellation.isCancelled()) throw new Error("Import cancelled.");
      const raw: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(await input.read()),
      );
      if (cancellation.isCancelled()) throw new Error("Import cancelled.");
      if (
        typeof raw !== "object" ||
        raw === null ||
        !("name" in raw) ||
        typeof raw.name !== "string"
      ) {
        throw new Error(`Invalid company report: ${input.path}`);
      }
      tests.push({
        id: input.path,
        name: raw.name,
        status: "passed",
        labels: {},
        steps: [],
        attachments: [],
      });
    }
    return { id: "company-import", sourceFormat: "company-json", tests };
  },
};
```

This example deliberately hardcodes `passed` as an illustration, so it is **not a production-quality result converter**. Never hardcode success in real adapters: map source status explicitly, preserve unknown values as `unknown`, and reject unsupported schemas.

## Custom static Docker build

This is an example multistage Dockerfile for a fork or build context containing a **trusted** `company-results.ts` and custom `converters.ts` as above:

```dockerfile
FROM node:22.16.0-bookworm AS builder
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /project
COPY package*.json ./
RUN npm ci
COPY . .

# A custom build context supplies these two reviewed, trusted files.
COPY company-results.ts ./src/extensions/company-results.ts
COPY converters.ts ./src/config/converters.ts

RUN npm run verify && npm run build:upstream

FROM nginx:alpine
COPY deployment/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /project/dist/ /usr/share/nginx/html/
EXPOSE 80
```

The extra files must exist in the Docker **build context**. The `src/extensions/` directory is created by the COPY destination, and its import must use the public API relative path as shown. `node_modules`, `.allure-workspace/`, and `dist/` should be excluded using `.dockerignore`. The exact Dockerfile above has not yet been tested as a release artifact; its purpose is to describe the build-time integration contract. Upstream Allure is fetched and built at the pinned commit during the builder stage, so this stage needs network access to GitHub and dependencies.

**Production runs Nginx only.** No Node/Yarn converter server, upload endpoint, database, Docker-mounted report processing or secrets are needed. Importing a report occurs after the page loads through the browser's file picker or drop zone.

## Failure modes and compatibility

| Condition | Result |
| --- | --- |
| Unsupported registry or converter API version | Registration error |
| Duplicate converter ID | Registration error |
| Invalid detection score outside integer 0–100 | Import error |
| Equal highest positive scores | Ambiguous import error; user must resolve |
| No detected format | Unsupported report error |
| Malformed normalized report | `InvalidTestReportError` before Awesome translation |
| Missing/ambiguous referenced attachment | Import error, not remote fallback |
| Unsafe ZIP entries, invalid CRC or size/ratio limits | ZIP import error |
| Cancelled import | No Awesome data is committed to the UI |

Converter API **major version 1** is fixed for this source-level contract. Additive compatible fields can be introduced in v1, but incompatible return-model or registration changes must use a new API major version and document migration. The exact UI widget integration is pinned to the upstream Allure SHA in `upstream.lock.json`; it is intentionally **not** covered by this public converter API. Validate against CI before updating Allure itself.

### Explicitly deferred

- A separately published npm SDK or dynamically discovered external packages.
- Running JavaScript uploaded alongside the report; sandboxing arbitrary plugins.
- Plugging in custom renderers or bypassing the Awesome adapter.
- Guarantees that every Allure feature maps through the current normalized v1 model.
- Firefox/Safari matrices, production Docker smoke, and release candidate hardening.

Additional report format converters will be implemented on top of this API in later milestones, not inserted directly into the frontend.
