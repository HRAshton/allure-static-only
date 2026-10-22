import assert from "node:assert/strict";
import test from "node:test";

import { awesomeReportData } from "../src/allure-adapter/awesome-data.ts";

test("generates Allure widgets, tree, result data and safe attachment references", () => {
  const report = {
    id: "sample",
    sourceFormat: "allure-results",
    tests: [
      {
        id: "unsafe/id",
        name: "<script>alert(1)</script>",
        status: "passed",
        durationMs: 125,
        labels: { suite: ["Static Import"] },
        attachments: [{ name: "image", sourcePath: "screenshot.png", mimeType: "image/png" }],
        steps: [],
      },
    ],
  };
  const { documents, binaries } = awesomeReportData(report);
  assert.equal(documents["widgets/statistic.json"].passed, 1);
  assert.deepEqual(documents["widgets/environments.json"], [{ id: "default", name: "Default" }]);
  assert.equal(
    documents["widgets/default/tree.json"].leavesById["test-0"].name,
    "<script>alert(1)</script>",
  );
  assert.equal(documents["data/test-results/test-0.json"].name, "<script>alert(1)</script>");
  assert.equal(documents["data/test-results/test-0.json"].attachments[0].type, "attachment");
  assert.deepEqual(binaries, [
    { targetPath: "data/attachments/attachment-0.png", sourcePath: "screenshot.png" },
  ]);
  assert.equal(
    Object.keys(documents).some((path) => path.includes("unsafe/id")),
    false,
  );
});

test("groups historical attempts and preserves a retry in the Allure UI contract", () => {
  const sample = (id, status, startMs) => ({
    id,
    historyId: "repeat-case",
    name: "repeated case",
    status,
    startMs,
    stopMs: startMs + 10,
    durationMs: 10,
    labels: { suite: ["Retries"] },
    steps: [],
    attachments: [],
  });
  const { documents } = awesomeReportData({
    id: "attempts",
    sourceFormat: "allure-results",
    tests: [sample("older", "failed", 100), sample("newer", "passed", 300)],
  });
  assert.equal(documents["widgets/statistic.json"].total, 1);
  assert.equal(documents["widgets/statistic.json"].passed, 1);
  assert.deepEqual(documents["widgets/nav.json"], ["test-1"]);
  const current = documents["data/test-results/test-1.json"];
  assert.equal(current.retriesCount, 1);
  assert.equal(current.retries[0].status, "failed");
  assert.equal(current.flaky, true);
  assert.equal(documents["data/test-results/test-0.json"].isRetry, true);
});

test("marks executable attachments as opaque downloads, not active previews", () => {
  const { documents } = awesomeReportData({
    id: "safety",
    sourceFormat: "allure-results",
    tests: [
      {
        id: "case",
        name: "attachment",
        status: "passed",
        labels: {},
        steps: [],
        attachments: [{ name: "page", sourcePath: "page.html", mimeType: "text/html" }],
      },
    ],
  });
  const attachment = documents["data/test-results/test-0.json"].attachments[0].link;
  assert.equal(attachment.contentType, "application/octet-stream");
});
