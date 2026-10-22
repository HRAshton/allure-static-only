import assert from "node:assert/strict";
import test from "node:test";
import {
  browserReportInputs,
  ImportCancelledError,
  normalizedFilePath,
} from "../src/runtime/browser-files.ts";
import { importBrowserReport } from "../src/runtime/import-browser-report.ts";

const file = (name, value = "data", relativePath) => {
  const f = new File([value], name, { type: "application/json" });
  if (relativePath) {
    Object.defineProperty(f, "webkitRelativePath", { value: relativePath });
  }
  return f;
};
const limits = { maxFiles: 2, maxFileBytes: 10, maxTotalBytes: 15 };

test("normalizes local relative paths", () => {
  assert.equal(normalizedFilePath("suite\\sample.json"), "suite/sample.json");
  for (const bad of [
    "",
    "/foo",
    "C:\\secret",
    "suite/../test",
    "foo//test",
    "foo/./test",
    "a\0b",
  ]) {
    assert.throws(() => normalizedFilePath(bad));
  }
});

test("returns local portable input ports", async () => {
  const inputs = browserReportInputs([file("test.json", "abc", "folder/test.json")]);
  assert.equal(inputs[0].path, "folder/test.json");
  assert.equal(inputs[0].mimeType, "application/json");
  assert.deepEqual([...(await inputs[0].read())], [97, 98, 99]);
});

test("rejects excessive files, bytes and duplicate paths", () => {
  assert.throws(() => browserReportInputs([], undefined, limits), /No report/);
  assert.throws(
    () => browserReportInputs([file("x"), file("y"), file("z")], undefined, limits),
    /file count/,
  );
  assert.throws(
    () => browserReportInputs([file("x", "01234567890")], undefined, limits),
    /per-file/,
  );
  assert.throws(
    () => browserReportInputs([file("x", "12345678"), file("y", "12345678")], undefined, limits),
    /total size/,
  );
  assert.throws(() => browserReportInputs([file("a"), file("a")], undefined, limits), /Duplicate/);
});

test("cancellation prevents reads and converter evaluation", async () => {
  const controller = new AbortController();
  const inputs = browserReportInputs([file("test.json")], controller.signal);
  controller.abort();
  await assert.rejects(inputs[0].read(), ImportCancelledError);
  await assert.rejects(
    importBrowserReport([file("test.json")], [], { signal: controller.signal }),
    ImportCancelledError,
  );
});

test("executes the detected converter, no network calls", async () => {
  let reads = 0;
  const converter = {
    id: "json",
    apiVersion: 1,
    extensions: [".json"],
    detect: async (files) => (files[0].path.endsWith(".json") ? 100 : 0),
    convert: async (files, cancellation) => {
      assert.equal(cancellation.isCancelled(), false);
      assert.equal(new TextDecoder().decode(await files[0].read()), "ok");
      reads += 1;
      return { id: "fixture", tests: [], sourceFormat: "json" };
    },
  };
  const report = await importBrowserReport([file("test.json", "ok")], [converter]);
  assert.equal(report.id, "fixture");
  assert.equal(reads, 1);
});
