# M3: native Allure results and ZIP conversion

Status: **accepted** following the successful M3 verification run. The browser integration uses the real upstream Allure Awesome frontend, without a frontend fork or runtime backend.

## Implemented

- Import native `*-result.json` files from a directory or `allure-results.zip` in the browser, using strict TypeScript converters.
- Normalize status, name, failure message, duration, labels, steps, attachments, and test history.
- Group retries by Allure `historyId`: only the latest attempt appears in the summary tree and counters, with older attempts available as retries.
- Translate normalized results into the pinned Allure Awesome widget/data model in-browser.
- Map attachments to opaque filenames. PNG screenshots are included; unsupported potentially active attachment MIME types are treated as `application/octet-stream` rather than executable previews.
- Load the original Allure frontend from static assets. Importing report files does not contact a report upload API.

## ZIP safety boundaries

The ZIP32 reader handles stored and deflated entries through local browser APIs. It rejects traversal or absolute paths, duplicate or overlapping entries, mismatched central/local filenames and metadata, corrupt checksums, symbolic links, encrypted archives, ZIP64, unrecognized compression methods, excess file counts or sizes, and suspicious compression ratios. Decompression uses bounded streaming; no user-provided archive code is executed.

## Verification

The following checks passed in GitHub Actions on the complete M3 source and test fixtures:

- Strict TypeScript, Biome, architecture rules and unit tests.
- Clean pinned upstream Allure build and generated-report reference smoke.
- Browser import of raw Allure JSON and a ZIP, rendered in the **original Allure UI**.
- Expanded browser fixture with two passed, one failed and one skipped visible tests; a retried case; nested steps; and PNG attachment bytes.
- Browser smoke audit for external report requests.

**Verified run:** https://github.com/HRAshton/allure-static-only/actions/runs/39815147206

The final branch is rebased onto current `main`. Its temporary branch-only verification workflow was excluded from the merge; the application, test and documentation files remain unchanged from the verified integration except for this status update.

## Known limitations and later work

- ZIP support is for **raw Allure results**, not arbitrary ZIP archives of already-generated Awesome output.
- Previewing every attachment type, full fidelity of unusual Allure result metadata, and additional format converters are outside M3.
- Cancellation occurs at asynchronous input boundaries; interrupted decompression and large-file performance need ongoing hardening.
- Cross-browser and Nginx deployment matrices, restrictive CSP, and broader security/performance assurance remain M6/M7 release-candidate gates.

M3 establishes working raw-results import, not a release-candidate-quality guarantee for arbitrary large or malformed report collections.
