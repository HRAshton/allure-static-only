import assert from "node:assert/strict";
import test from "node:test";

import { readConvertedReport } from "../src/shell/import-generated.mjs";

test("cancellation between module load and conversion prevents converter execution", async () => {
  const controller = new AbortController();
  let calls = 0;
  const load = async () => {
    controller.abort();
    return {
      converterRegistry: { converters: [] },
      importBrowserReport: async () => {
        calls += 1;
        return {};
      },
      awesomeReportData: () => ({ documents: {}, binaries: [] }),
      unzipReportFiles: async () => [],
    };
  };
  const file = new File(["example"], "report.json");
  await assert.rejects(
    readConvertedReport([file], { signal: controller.signal }, load),
    /cancelled/,
  );
  assert.equal(calls, 0);
});
