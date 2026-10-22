import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, ".allure-workspace", "m3-complex-results");
await mkdir(output, { recursive: true });

const base = {
  stage: "finished",
  labels: [{ name: "suite", value: "M3 Validation" }],
};

const reports = [
  {
    ...base,
    uuid: "m3-screenshot",
    historyId: "m3-screenshot",
    name: "M3 screenshot test",
    status: "passed",
    start: 1000,
    stop: 1200,
    steps: [
      {
        name: "Outer screenshot step",
        status: "passed",
        start: 1010,
        stop: 1190,
        steps: [
          {
            name: "Inner screenshot step",
            status: "passed",
            start: 1020,
            stop: 1100,
            attachments: [
              { name: "Evidence screenshot", source: "m3-image.png", type: "image/png" },
            ],
          },
        ],
      },
    ],
  },
  { ...base, uuid: "m3-skipped", name: "M3 skipped test", status: "skipped" },
  {
    ...base,
    uuid: "m3-failure",
    name: "M3 failed test",
    status: "failed",
    statusDetails: { message: "Expected failure for verification" },
  },
  {
    ...base,
    uuid: "m3-retry-old",
    historyId: "m3-retried",
    name: "M3 flaky test",
    status: "failed",
    statusDetails: { message: "Previous attempt failed" },
    start: 2000,
    stop: 2100,
  },
  {
    ...base,
    uuid: "m3-retry-new",
    historyId: "m3-retried",
    name: "M3 flaky test",
    status: "passed",
    start: 3000,
    stop: 3100,
  },
];
for (const [index, result] of reports.entries()) {
  await writeFile(path.join(output, `case-${index}-result.json`), JSON.stringify(result), "utf8");
}
await writeFile(
  path.join(output, "m3-image.png"),
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLh9QAAAABJRU5ErkJggg==",
    "base64",
  ),
);
console.log("Prepared M3 pass/fail/skip/retry/nested-steps/PNG fixture.");
