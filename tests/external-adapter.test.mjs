import assert from "node:assert/strict";
import test from "node:test";

import { companyResultsConverter } from "../examples/company-adapter/converter.ts";
import { awesomeReportData } from "../src/allure-adapter/awesome-data.ts";

const file = (name, value) => {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
  return {
    path: name,
    byteLength: bytes.byteLength,
    read: async () => bytes,
  };
};

const report = {
  kind: "acme.test-report.v1",
  tests: [
    { name: "works", status: "passed", durationMs: 20 },
    { name: "<script>test</script>", status: "failed", message: "broken" },
  ],
};

test("external converter uses public API v1 without Allure dependencies", async () => {
  assert.equal(companyResultsConverter.apiVersion, 1);
  assert.equal(await companyResultsConverter.detect([file("case.company.json", report)]), 98);
  assert.equal(await companyResultsConverter.detect([file("case.company.json", { tests: [] })]), 0);
  const converted = await companyResultsConverter.convert([file("case.company.json", report)], {
    isCancelled: () => false,
  });
  assert.equal(converted.tests.length, 2);
  assert.equal(converted.tests[0].durationMs, 20);
  assert.equal(converted.tests[1].message, "broken");
  const awesome = awesomeReportData(converted);
  assert.equal(awesome.documents["widgets/statistic.json"].total, 2);
  assert.equal(awesome.documents["widgets/statistic.json"].failed, 1);
});

test("external converter rejects invalid inputs, cancellation and size abuse", async () => {
  for (const invalid of [
    { kind: "acme.test-report.v1", tests: "wrong" },
    { kind: "acme.test-report.v1", tests: [{ name: "x", status: "impossible" }] },
    { kind: "acme.test-report.v1", tests: [{ name: "x", status: "passed", durationMs: -2 }] },
    { kind: "acme.test-report.v1", tests: [{ name: "", status: "passed" }] },
  ]) {
    await assert.rejects(
      companyResultsConverter.convert([file("bad.company.json", invalid)], {
        isCancelled: () => false,
      }),
    );
  }
  await assert.rejects(
    companyResultsConverter.convert([file("report.company.json", report)], {
      isCancelled: () => true,
    }),
    /cancelled/,
  );
  await assert.rejects(
    companyResultsConverter.convert(
      [
        {
          path: "huge.company.json",
          byteLength: 1024 * 1024 + 1,
          read: async () => {
            throw Error("must not read");
          },
        },
      ],
      { isCancelled: () => false },
    ),
    /1 MiB/,
  );
});
