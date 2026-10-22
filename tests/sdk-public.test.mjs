import assert from "node:assert/strict";
import test from "node:test";

import defaultRegistry from "../src/extensions/converters.ts";
import { chooseConverter, AmbiguousReportError } from "../src/runtime/choose-converter.ts";
import { importBrowserReport } from "../src/runtime/import-browser-report.ts";
import { CONVERTER_API_VERSION, defineConverters } from "../src/sdk/index.ts";

const sampleReport = (name) => ({
  id: "external",
  name,
  sourceFormat: "company-json",
  tests: [
    {
      id: "case",
      name,
      status: "passed",
      labels: {},
      steps: [],
      attachments: [],
    },
  ],
});
const converter = (id, confidence = 90) => ({
  id,
  apiVersion: CONVERTER_API_VERSION,
  extensions: [".json"],
  async detect() {
    return confidence;
  },
  async convert(inputs, cancellation) {
    if (cancellation.isCancelled()) {
      throw new Error("cancelled");
    }
    const content = await inputs[0].read();
    return sampleReport(new TextDecoder().decode(content));
  },
});

test("public registry contains the built-in Allure converter", () => {
  assert.ok(defaultRegistry.converters.some((item) => item.id === "allure-results"));
  assert.equal(Object.isFrozen(defaultRegistry), true);
  assert.equal(Object.isFrozen(defaultRegistry.converters), true);
});

test("public registration validates API version, IDs, extensions and methods", () => {
  assert.throws(() => defineConverters({ converters: [] }), /at least one/);
  assert.throws(
    () => defineConverters({ converters: [converter("company"), converter("company")] }),
    /Duplicate converter ID/,
  );
  assert.throws(
    () => defineConverters({ converters: [{ ...converter("company"), apiVersion: 2 }] }),
    /unsupported API version/,
  );
  assert.throws(() => defineConverters({ converters: [{ ...converter("Company") }] }), /lowercase/);
  assert.throws(
    () => defineConverters({ converters: [{ ...converter("company"), extensions: ["json"] }] }),
    /lowercase file extensions/,
  );
});

test("a third-party converter runs through the unchanged browser import pipeline", async () => {
  const registered = defineConverters({ converters: [converter("company-json")] });
  const result = await importBrowserReport(
    [new File(["from a custom format"], "run.json", { type: "application/json" })],
    registered.converters,
  );
  assert.equal(result.sourceFormat, "company-json");
  assert.equal(result.tests[0].name, "from a custom format");
});

test("selection honors detection scores and reports ties instead of guessing", async () => {
  const inputs = [{ path: "test.json", byteLength: 2, read: async () => new Uint8Array(2) }];
  assert.equal(
    (await chooseConverter([converter("lower", 20), converter("higher", 80)], inputs)).id,
    "higher",
  );
  await assert.rejects(
    chooseConverter([converter("alpha"), converter("beta")], inputs),
    AmbiguousReportError,
  );
});
