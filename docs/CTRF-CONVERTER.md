# CTRF JSON converter (public converter API v1)

This converter imports [Common Test Report Format](https://github.com/ctrf-io/ctrf) JSON from the local browser filesystem, without a backend, remote upload or dependency on the CTRF CLI. See the upstream [CTRF draft specification](https://github.com/ctrf-io/ctrf/blob/main/spec/ctrf.md) and [JSON schema](https://github.com/ctrf-io/ctrf/blob/main/schema/ctrf.schema.json). The current draft is pre-1.0 and may change.

## Input selection

Drag a CTRF `.json` file into the static UI, select the file, or select a folder with CTRF reports. A file matches when its decoded JSON object declares `reportFormat: "CTRF"`. The detection confidence is higher than the native Allure filename detection. Files without that marker are ignored or routed to another registered converter. Malformed or unknown JSON is rejected rather than guessed.

Top-level `specVersion` must be `x.y.z`, and `results.tool.name`, `results.summary`, and `results.tests` must be present. Required status/count metadata is validated. Tests may be grouped across selected CTRF files; report-relative source filenames scope retry grouping.

## Mapping and information loss

| CTRF field | Normalized result |
| --- | --- |
| `name` | Test name |
| `status: passed/failed/skipped` | Same status |
| `status: pending` | Skipped (not executed) |
| `status: other` | Unknown; no fabricated success |
| `duration` | Milliseconds, unchanged |
| `start` / `stop` | Unix milliseconds, unchanged when present |
| `suite` array | Final component as suite, ancestors as parentSuite |
| `tags` | Tag labels |
| `browser`, `filePath` | Browser and package labels |
| `message` | Failure/status detail (max 16 KiB) |
| `steps[].name/status` | Named top-level steps |
| `attachments[].path/contentType` | Safe report-relative imported attachment paths |
| `retries` / `retryAttempts` | Previous attempts with the final test visible once |

Inputs are size-limited to 8 MiB per CTRF JSON file and 2,000 normalized tests/attempts. No more than 100 historical retry attempts per test are accepted. ZIP loading uses the existing bounded browser ZIP reader. Mismatched retry counts, unsafe attachment paths, invalid statuses/timings, and malformed UTF-8 are rejected.

**Not mapped in this milestone:** CTRF base64 `screenshot`, `stdout`, `stderr`, rich `labels` values, arbitrary `extra`, `insights`, `baseline`, metrics, parameters and environment records. Unsupported values are not invented or sent to a server. Source `results.summary` is checked for required fields but the frontend recalculates visible statistics from normalized tests rather than trusting counts that may not match imported/filtered attempts.

This is a documented subset rather than a full CTRF schema validator; it checks the required fields it needs and fails closed on malformed mapped fields. Advanced schema conformance and additional fields remain compatibility work before RC.

## Demo and acceptance

Use the public sample at `fixtures/demo-ctrf.json` and (when deployed) [the GitHub Pages demo](https://hrashton.github.io/allure-static-only/). The fixture includes passed/failed/skipped/other status, a retried flaky test, timestamps, steps, tags, and nested suites. The browser smoke checks that the **original** Allure UI renders CTRF suites and verifies the generated widget statistics and retry history. User report bytes never leave the browser.
