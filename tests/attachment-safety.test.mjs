import assert from "node:assert/strict";
import test from "node:test";

import { awesomeReportData } from "../src/allure-adapter/awesome-data.ts";

test("untrusted attachment types cannot influence active browser preview extensions", () => {
  const samples = [
    { sourcePath: "attack.svg", mimeType: "image/svg+xml", ext: "", type: "application/octet-stream" },
    { sourcePath: "spoof.html", mimeType: "image/png", ext: "", type: "application/octet-stream" },
    { sourcePath: "payload.js", mimeType: "text/plain", ext: "", type: "application/octet-stream" },
    { sourcePath: "report.png", mimeType: "text/html", ext: "", type: "application/octet-stream" },
    { sourcePath: "valid.png", mimeType: "image/png", ext: ".png", type: "image/png" },
    { sourcePath: "valid.txt", mimeType: "text/plain", ext: ".txt", type: "text/plain" },
  ];
  const report = {
    id: "attachment-security",
    sourceFormat: "allure-results",
    tests: [
      {
        id: "case-1",
        name: "Inspect attachment metadata",
        status: "passed",
        labels: {},
        steps: [],
        attachments: samples.map(({ sourcePath, mimeType }) => ({
          name: "<img src=x onerror=attack()>",
          sourcePath,
          mimeType,
        })),
      },
    ],
  };
  const { documents, binaries } = awesomeReportData(report);
  const links = documents["data/test-results/test-0.json"].attachments.map(
    (attachment) => attachment.link,
  );
  for (const [index, sample] of samples.entries()) {
    const link = links[index];
    assert.equal(link.ext, sample.ext);
    assert.equal(link.contentType, sample.type);
    assert.equal(link.originalFileName, sample.sourcePath);
    assert.equal(link.name, "<img src=x onerror=attack()>");
    assert.equal(binaries[index].sourcePath, sample.sourcePath);
    assert.equal(binaries[index].targetPath, `data/attachments/attachment-${index}${sample.ext}`);
  }
});
