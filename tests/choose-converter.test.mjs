import assert from "node:assert/strict";
import test from "node:test";
import {
  AmbiguousReportError,
  chooseConverter,
  UnsupportedReportError,
} from "../src/runtime/choose-converter.ts";

const input = [{ path: "results.xml", byteLength: 0, read: async () => new Uint8Array() }];
const converter = (id, score) => ({
  id,
  apiVersion: 1,
  extensions: [".xml"],
  detect: async () => score,
  convert: async () => ({ id, tests: [], sourceFormat: id }),
});

test("selects the highest-confidence converter", async () => {
  const selected = await chooseConverter([converter("low", 30), converter("high", 95)], input);
  assert.equal(selected.id, "high");
});

test("rejects equally confident converters", async () => {
  await assert.rejects(
    chooseConverter([converter("a", 90), converter("b", 90)], input),
    AmbiguousReportError,
  );
});

test("rejects unsupported and empty inputs", async () => {
  await assert.rejects(chooseConverter([converter("a", 0)], input), UnsupportedReportError);
  await assert.rejects(chooseConverter([converter("a", 100)], []), UnsupportedReportError);
});

test("rejects malformed detection scores", async () => {
  await assert.rejects(chooseConverter([converter("bad", Number.NaN)], input), /invalid detection/);
  await assert.rejects(chooseConverter([converter("bad", 101)], input), /invalid detection/);
});
