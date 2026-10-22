# M3: native Allure results converter spike

Status: **draft**. Allure UI integration and ZIP support are not complete.

This isolated converter reads imported `*-result.json` files through the converter port and returns the normalized report model. It maps status, full name, failure message, durations, labels, nested steps, and attachment references. Unknown status is preserved as unknown; missing timing is not fabricated.

The converter never calls `fetch` or uploads data. It rejects malformed UTF-8/JSON, malformed arrays, duplicate UUIDs, unsafe attachment paths and excessive step nesting (32) / total steps per test (10,000). The containing browser file adapter imposes input size limits.

## Known missing acceptance gates

- Import ZIP via a strictly bounded, path-safe archive adapter (including compressed/expanded byte and file-entry limits).
- Resolve attachment content against included files and provide it to the Allure data adapter.
- Feed normalized results through the **real** upstream Allure UI's generated widget schema.
- Verify screenshots, retries, fixture steps, damaged fixtures and same-name tests end-to-end.
- Complete M1's upstream browser feasibility gate and M2's browser wiring.

Five focused `node:test` cases and strict TypeScript type-check passed in a local Node 22.16 environment. This does not establish Biome, archive security or browser compatibility. Do **not** merge until the milestone gates are complete.

## M3 browser adapter spike

- A strict TypeScript build compiles the portable converter, runtime input port and Allure-specific adapter into native browser ESM in `dist/app/`.
- The static import shell recognizes `*-result.json` input and generates the minimum report widgets expected by the original Allure 3 frontend, entirely in the browser.
- A separate browser smoke imports the **raw** Allure fixture, checks rendering of a passing test and asserts no report uploads.
- Attachment names are mapped into opaque, safe generated filenames; missing or ambiguous references fail closed.

**Not yet complete:** safe ZIP import, broad attachment/step/retry compatibility fixtures, and cross-browser verification. Do not merge M3 until these are verified.

## Bounded browser ZIP imports

ZIP32 stored and deflated entries are parsed using browser File APIs and the native `DecompressionStream`. The extractor rejects absolute/traversal paths, duplicate entry names, checksum failures, ZIP64/encrypted data, oversized source and decompressed bytes, excess entry counts, symlinks and abnormal compression ratios. Streamed decompression is capped to the advertised uncompressed size. The input remains local; the CI smoke imports the same fixture as a ZIP and checks the real Allure UI. ZIP archives holding a generated Awesome report are not yet supported by this route.

## Expanded acceptance tests

The M3 fixtures now cover passed, failed, and skipped results; historical retry attempts grouped by `historyId` and start timestamp; nested steps; and binary PNG attachments. Test history is available in the real Allure UI contract, while only the latest attempt counts toward the visible tree and statistics. The smoke test checks the generated widget statistics, retried attempt, PNG signature and nested step, then opens the result in the upstream UI. HTML and other potentially active attachments are mapped to `application/octet-stream` rather than an inline active preview.

The ZIP extractor checks consistency between central and local headers, rejects overlapping entry ranges, and rejects deceptive local filenames. The browser import resolves attachment file paths unambiguously, rather than using a basename-only match.
