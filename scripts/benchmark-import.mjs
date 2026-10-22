import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { awesomeReportData } from "../src/allure-adapter/awesome-data.ts";
import { validateTestReport } from "../src/domain/validate-report.ts";

const start = performance.now();
const baseline = process.memoryUsage().heapUsed;
const tests = Array.from({ length: 1800 }, (_, index) => ({
  id: `fixture-${index}`,
  name: `Representative synthetic test ${index}`,
  status: index % 5 === 0 ? "failed" : "passed",
  labels: { suite: [`Suite ${index % 12}`] },
  steps: [{ name: "Step", status: "passed", steps: [], attachments: [] }],
  attachments: [],
}));
const report = { id: "benchmark", sourceFormat: "synthetic", tests };
validateTestReport(report);
const result = awesomeReportData(report);
const bytes = Object.values(result.documents).reduce(
  (total, value) => total + Buffer.byteLength(JSON.stringify(value)),
  0,
);
const elapsed = Math.round(performance.now() - start);
const heap = Math.max(0, process.memoryUsage().heapUsed - baseline);
assert.equal(result.documents["widgets/statistic.json"].total, 1800);
assert.ok(bytes > 100000);
console.log(JSON.stringify({ cases: 1800, elapsedMs: elapsed, deltaHeapMiB: heap / 1048576, bytes }));
assert.ok(elapsed < 15000, "Adapter exceeded 15s benchmark ceiling");
assert.ok(heap < 192 * 1048576, "Adapter exceeded 192MiB incremental heap ceiling");
