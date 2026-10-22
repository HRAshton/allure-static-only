import assert from "node:assert/strict";
import test from "node:test";

import registered from "../src/config/converters.ts";
import { chooseConverter } from "../src/runtime/choose-converter.ts";
import { importBrowserReport } from "../src/runtime/import-browser-report.ts";
import {
  CONVERTER_API_VERSION,
  defineConverters,
  InvalidTestReportError,
  validateTestReport,
} from "../src/sdk/index.ts";

const valid = (id, score = 100) => ({
  id,
  apiVersion: 1,
  extensions: [".fiction"],
  async detect(inputs) {
    return inputs.some((input) => input.path.endsWith(".fiction")) ? score : 0;
  },
  async convert() {
    return {
      id: "example-report",
      sourceFormat: "fictional",
      tests: [
        {
          id: "one",
          name: "public API example",
          status: "passed",
          labels: {},
          steps: [],
          attachments: [],
        },
      ],
    };
  },
});

test("API version 1 is registered in the default source configuration", () => {
  assert.equal(CONVERTER_API_VERSION, 1);
  assert.equal(registered.apiVersion, 1);
  assert.deepEqual(
    registered.converters.map(({ id }) => id),
    ["allure-results", "junit-xml"],
  );
  assert.equal(Object.isFrozen(registered.converters), true);
});

test("rejects duplicate IDs and incompatible or incomplete build registrations", () => {
  assert.throws(
    () => defineConverters({ apiVersion: 1, converters: [valid("a"), valid("a")] }),
    /Duplicate converter registration/,
  );
  assert.throws(
    () => defineConverters({ apiVersion: 1, converters: [{ ...valid("a"), apiVersion: 2 }] }),
    /Invalid converter registration/,
  );
  assert.throws(
    () => defineConverters({ apiVersion: 1, converters: [valid("Upper Case")] }),
    /Invalid converter registration/,
  );
  assert.throws(
    () => defineConverters({ apiVersion: 1, converters: [{ ...valid("a"), extensions: [] }] }),
    /Invalid converter registration/,
  );
  assert.throws(
    () => defineConverters({ apiVersion: 1, converters: [] }),
    /Invalid converter registry/,
  );
});

test("registers a future custom converter without changing the importer", async () => {
  const registry = defineConverters({ apiVersion: 1, converters: [valid("sample")] });
  const data = new File(["sample"], "report.fiction");
  const report = await importBrowserReport([data], registry.converters);
  assert.equal(report.tests[0].name, "public API example");

  const selected = await chooseConverter(registry.converters, [
    { path: "report.fiction", byteLength: 1, read: async () => new Uint8Array([1]) },
  ]);
  assert.equal(selected.id, "sample");
});

test("rejects invalid normalized results at the public boundary", async () => {
  const data = new File(["example"], "report.fiction");
  const broken = {
    ...valid("broken"),
    async convert() {
      return {
        id: "broken",
        sourceFormat: "fictional",
        tests: [
          {
            id: "../bad",
            name: "broken",
            status: "invalid",
            labels: {},
            steps: [],
            attachments: [],
          },
        ],
      };
    },
  };
  await assert.rejects(importBrowserReport([data], [broken]), InvalidTestReportError);
  assert.throws(
    () => validateTestReport({ id: "bad", sourceFormat: "x", tests: {} }),
    /tests must/,
  );
  assert.throws(
    () =>
      validateTestReport({
        id: "x",
        sourceFormat: "x",
        tests: [
          {
            id: "a",
            name: "t",
            status: "passed",
            labels: {},
            steps: [],
            attachments: [{ name: "escape", sourcePath: "../secret.png" }],
          },
        ],
      }),
    /attachment path is unsafe/,
  );
});
