import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(await readFile(path.join(root, "upstream.lock.json"), "utf8"));
const upstream = path.join(root, ".allure-workspace", "upstream");
const results = path.join(root, ".allure-workspace", "m1-fixture-results");
const output = path.join(root, ".allure-workspace", "m1-fixture-report");

await mkdir(results, { recursive: true });
await writeFile(
  path.join(results, "m1-smoke-result.json"),
  JSON.stringify({
    uuid: "e84ba706-c46c-4ce3-bd18-c02284fe0d06",
    historyId: "allure-static-only.m1.smoke",
    testCaseId: "allure-static-only.m1.smoke",
    name: "M1 browser fixture passing test",
    fullName: "allure-static-only.m1.smoke",
    status: "passed",
    stage: "finished",
    start: 1792670000000,
    stop: 1792670000100,
    labels: [{ name: "suite", value: "Static Import" }],
  }),
  "utf8",
);
execFileSync(
  "corepack",
  [
    "yarn",
    "run",
    "-T",
    "allure",
    "generate",
    results,
    "--config=./allurerc-dev.mjs",
    "--output",
    output,
  ],
  {
    cwd: path.join(upstream, "packages", "web-awesome"),
    stdio: "inherit",
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, "--experimental-strip-types"]
        .filter(Boolean)
        .join(" "),
    },
  },
);
await readFile(path.join(output, "widgets", "statistic.json"), "utf8");
console.log(`Created Allure ${lock.commit} M1 report fixture: ${output}`);
