import assert from "node:assert/strict";
import test from "node:test";
import {
  bytesToBase64,
  normalizedGeneratedPath,
  readGeneratedAllure,
} from "../src/shell/import-generated.mjs";

const fakeFile = (path, contents) => {
  const bytes = new TextEncoder().encode(contents);
  return {
    name: path.split("/").at(-1),
    webkitRelativePath: path,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  };
};

test("extracts only generated Allure paths", () => {
  assert.equal(
    normalizedGeneratedPath("report/awesome/widgets/statistic.json"),
    "widgets/statistic.json",
  );
  assert.equal(
    normalizedGeneratedPath("awesome/data/test-results/a.json"),
    "data/test-results/a.json",
  );
  assert.equal(normalizedGeneratedPath("../widgets/statistic.json"), undefined);
  assert.equal(normalizedGeneratedPath("/private/widgets/statistic.json"), undefined);
  assert.equal(normalizedGeneratedPath("report/other.json"), undefined);
});

test("encodes binary content without interpreting it as text", () => {
  assert.equal(bytesToBase64(Uint8Array.from([0, 255, 1])), "AP8B");
});

test("imports generated data locally", async () => {
  const report = await readGeneratedAllure([
    fakeFile("awesome/widgets/statistic.json", '{"total":1}'),
    fakeFile("awesome/data/test-results/a.json", '{"id":"a"}'),
  ]);
  assert.deepEqual(Object.keys(report).sort(), [
    "data/test-results/a.json",
    "widgets/statistic.json",
  ]);
  assert.equal(atob(report["widgets/statistic.json"]), '{"total":1}');
});

test("rejects missing manifest and duplicate paths", async () => {
  await assert.rejects(readGeneratedAllure([]), /widgets\/statistic.json/);
  await assert.rejects(
    readGeneratedAllure([
      fakeFile("report1/widgets/statistic.json", "{}"),
      fakeFile("report2/widgets/statistic.json", "{}"),
    ]),
    /Duplicate/,
  );
});

test("reports progress and supports cancellation", async () => {
  const progress = [];
  const report = await readGeneratedAllure(
    [
      fakeFile("awesome/widgets/statistic.json", '{"total":1}'),
      fakeFile("awesome/widgets/tree.json", "{}"),
    ],
    { onProgress: (update) => progress.push(update) },
  );
  assert.equal(Object.keys(report).length, 2);
  assert.equal(progress.length, 2);
  assert.equal(progress.at(-1).processedBytes, progress.at(-1).totalBytes);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readGeneratedAllure([fakeFile("awesome/widgets/statistic.json", "{}")], {
      signal: controller.signal,
    }),
    /cancelled/,
  );
});

test("rejects oversized generated files before reading them", async () => {
  const big = {
    name: "statistic.json",
    webkitRelativePath: "awesome/widgets/statistic.json",
    size: 32 * 1024 * 1024 + 1,
    async arrayBuffer() {
      throw new Error("Should not read an oversized file");
    },
  };
  await assert.rejects(readGeneratedAllure([big]), /32 MiB/);
});
