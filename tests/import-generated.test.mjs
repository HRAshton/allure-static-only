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
  assert.equal(normalizedGeneratedPath("report/awesome/widgets/stats.json"), "widgets/stats.json");
  assert.equal(normalizedGeneratedPath("awesome/data/test-results/a.json"), "data/test-results/a.json");
  assert.equal(normalizedGeneratedPath("../widgets/stats.json"), undefined);
  assert.equal(normalizedGeneratedPath("/private/widgets/stats.json"), undefined);
  assert.equal(normalizedGeneratedPath("report/other.json"), undefined);
});

test("encodes binary content without interpreting it as text", () => {
  assert.equal(bytesToBase64(Uint8Array.from([0, 255, 1])), "AP8B");
});

test("imports generated data locally", async () => {
  const report = await readGeneratedAllure([
    fakeFile("awesome/widgets/stats.json", '{"total":1}'),
    fakeFile("awesome/data/test-results/a.json", '{"id":"a"}'),
  ]);
  assert.deepEqual(Object.keys(report).sort(), ["data/test-results/a.json", "widgets/stats.json"]);
  assert.equal(atob(report["widgets/stats.json"]), '{"total":1}');
});

test("rejects missing manifest and duplicate paths", async () => {
  await assert.rejects(readGeneratedAllure([]), /widgets\/stats.json/);
  await assert.rejects(
    readGeneratedAllure([
      fakeFile("report1/widgets/stats.json", "{}"),
      fakeFile("report2/widgets/stats.json", "{}"),
    ]),
    /Duplicate/,
  );
});
