import assert from "node:assert/strict";
import test from "node:test";
import {
  allureResultsConverter,
  MalformedAllureResultsError,
} from "../src/converters/allure-results.ts";

const input = (name, content) => ({
  path: name,
  byteLength: content.length,
  read: async () => new TextEncoder().encode(content),
});
const cancellation = { isCancelled: () => false };
const raw = {
  uuid: "uuid-1",
  name: "works",
  fullName: "suite.works",
  status: "passed",
  start: 10,
  stop: 35,
  statusDetails: { message: "details" },
  labels: [
    { name: "suite", value: "A" },
    { name: "suite", value: "B" },
  ],
  steps: [{ name: "step", status: "passed", start: 11, stop: 20, steps: [{ name: "nested" }] }],
  attachments: [{ name: "image", source: "abc-attachment.png", type: "image/png" }],
};

test("detects the native Allure result format", async () => {
  assert.equal(await allureResultsConverter.detect([input("results/123-result.json", "{}")]), 90);
  assert.equal(await allureResultsConverter.detect([input("junit.xml", "<xml/>")]), 0);
});

test("normalizes nested steps, labels and attachments without inventing missing fields", async () => {
  const report = await allureResultsConverter.convert(
    [input("results/a-result.json", JSON.stringify(raw))],
    cancellation,
  );
  assert.equal(report.tests.length, 1);
  const [entry] = report.tests;
  assert.equal(entry.status, "passed");
  assert.equal(entry.durationMs, 25);
  assert.equal(entry.message, "details");
  assert.deepEqual(entry.labels.suite, ["A", "B"]);
  assert.equal(entry.steps[0].steps[0].name, "nested");
  assert.equal("durationMs" in entry.steps[0].steps[0], false);
  assert.deepEqual(entry.attachments[0], {
    name: "image",
    sourcePath: "abc-attachment.png",
    mimeType: "image/png",
  });
});

test("rejects malformed JSON, duplicate UUID and unsafe attachments", async () => {
  await assert.rejects(
    allureResultsConverter.convert([input("a-result.json", "not json")], cancellation),
    MalformedAllureResultsError,
  );
  await assert.rejects(
    allureResultsConverter.convert(
      [input("a-result.json", JSON.stringify(raw)), input("b-result.json", JSON.stringify(raw))],
      cancellation,
    ),
    /duplicate UUID/,
  );
  await assert.rejects(
    allureResultsConverter.convert(
      [
        input(
          "a-result.json",
          JSON.stringify({ ...raw, attachments: [{ name: "bad", source: "../escape" }] }),
        ),
      ],
      cancellation,
    ),
    /unsafe attachment path/,
  );
});

test("honors cancellation and rejects malformed fields", async () => {
  await assert.rejects(
    allureResultsConverter.convert([input("a-result.json", JSON.stringify(raw))], {
      isCancelled: () => true,
    }),
    /cancelled/,
  );
  await assert.rejects(
    allureResultsConverter.convert(
      [input("a-result.json", JSON.stringify({ ...raw, labels: {} }))],
      cancellation,
    ),
    /labels must be an array/,
  );
});

test("preserves retry identity and exact attempt timestamps", async () => {
  const report = await allureResultsConverter.convert(
    [
      input(
        "sample-result.json",
        JSON.stringify({ ...raw, historyId: "history-1", start: 1000, stop: 1011 }),
      ),
    ],
    cancellation,
  );
  assert.equal(report.tests[0].historyId, "history-1");
  assert.equal(report.tests[0].startMs, 1000);
  assert.equal(report.tests[0].stopMs, 1011);
});

test("preserves unknown status and absent duration", async () => {
  const report = await allureResultsConverter.convert(
    [input("a-result.json", JSON.stringify({ uuid: "a", name: "missing" }))],
    cancellation,
  );
  assert.equal(report.tests[0].status, "unknown");
  assert.equal("durationMs" in report.tests[0], false);
});
