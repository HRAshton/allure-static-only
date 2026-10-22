import assert from "node:assert/strict";
import test from "node:test";

import { awesomeReportData } from "../src/allure-adapter/awesome-data.ts";
import { ctrfJsonConverter, InvalidCTRFError } from "../src/converters/ctrf-json.ts";

const sample = {
  reportFormat: "CTRF",
  specVersion: "0.2.0",
  results: {
    tool: { name: "example" },
    summary: {
      tests: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      pending: 0,
      other: 0,
      start: 1700000000000,
      stop: 1700000000500,
    },
    tests: [{ name: "works", status: "passed", duration: 50 }],
  },
};
const file = (name, value) => {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
  return { path: name, byteLength: bytes.byteLength, read: async () => bytes };
};
const active = { isCancelled: () => false };

test("detects CTRF by reportFormat, not JSON extension alone", async () => {
  assert.equal(await ctrfJsonConverter.detect([file("report.json", sample)]), 99);
  assert.equal(await ctrfJsonConverter.detect([file("report.json", "{}")]), 0);
  assert.equal(await ctrfJsonConverter.detect([file("report.xml", sample)]), 0);
});

test("normalizes status, milliseconds, labels, steps and retries", async () => {
  const value = structuredClone(sample);
  value.results.tests = [
    {
      name: "passed",
      status: "passed",
      duration: 120,
      suite: ["API", "Smoke"],
      tags: ["nightly"],
      steps: [{ name: "open", status: "passed" }],
    },
    { name: "pending", status: "pending", duration: 0 },
    { name: "other", status: "other", duration: 0 },
    {
      name: "retries",
      status: "passed",
      duration: 20,
      testId: "retries",
      start: 1700000003000,
      retries: 1,
      retryAttempts: [
        { attempt: 1, status: "failed", duration: 10, start: 1700000001000, message: "flaked" },
      ],
    },
  ];
  const report = await ctrfJsonConverter.convert([file("ctrf.json", value)], active);
  assert.equal(report.tests.length, 5);
  assert.equal(report.tests[0].durationMs, 120);
  assert.deepEqual(report.tests[0].labels.suite, ["Smoke"]);
  assert.deepEqual(report.tests[0].labels.parentSuite, ["API"]);
  assert.deepEqual(report.tests[0].labels.tag, ["nightly"]);
  assert.equal(report.tests[0].steps[0].name, "open");
  assert.equal(report.tests[1].status, "skipped");
  assert.equal(report.tests[2].status, "unknown");
  assert.equal(report.tests[3].message, "flaked");
  assert.equal(report.tests[3].historyId, report.tests[4].historyId);
  const { documents } = awesomeReportData(report);
  assert.equal(documents["widgets/statistic.json"].total, 4);
  assert.equal(documents["widgets/statistic.json"].passed, 2);
  const latest = documents["data/test-results/test-4.json"];
  assert.equal(latest.retriesCount, 1);
  assert.equal(latest.retries[0].status, "failed");
  assert.equal(latest.flaky, true);
});

test("fails closed for malformed CTRF and unsupported versions", async () => {
  for (const broken of [
    { ...sample, reportFormat: "not ctrf" },
    { ...sample, specVersion: "2" },
    { ...sample, results: { ...sample.results, tool: {} } },
    { ...sample, results: { ...sample.results, summary: {} } },
    {
      ...sample,
      results: { ...sample.results, tests: [{ name: "bad", status: "broken", duration: 1 }] },
    },
    {
      ...sample,
      results: { ...sample.results, tests: [{ name: "bad", status: "passed", duration: -3 }] },
    },
    {
      ...sample,
      results: {
        ...sample.results,
        tests: [
          {
            name: "unsafe",
            status: "passed",
            duration: 1,
            attachments: [{ name: "path", path: "../passwords", contentType: "text/plain" }],
          },
        ],
      },
    },
  ]) {
    await assert.rejects(
      ctrfJsonConverter.convert([file("invalid.json", broken)], active),
      /Invalid CTRF report|No CTRF reports/,
    );
  }
});

test("enforces attempt ordering, conversion cancellation and size limits", async () => {
  const broken = structuredClone(sample);
  broken.results.tests = [
    {
      name: "attempts",
      status: "passed",
      duration: 2,
      retries: 1,
      retryAttempts: [{ attempt: 3, status: "failed", duration: 1 }],
    },
  ];
  await assert.rejects(
    ctrfJsonConverter.convert([file("bad.json", broken)], active),
    InvalidCTRFError,
  );
  await assert.rejects(
    ctrfJsonConverter.convert([file("ok.json", sample)], { isCancelled: () => true }),
    /cancelled/,
  );
  await assert.rejects(
    ctrfJsonConverter.convert(
      [
        {
          path: "huge.json",
          byteLength: 8 * 1024 * 1024 + 1,
          read: async () => {
            throw Error("must not read");
          },
        },
      ],
      active,
    ),
    /8 MiB/,
  );
});
