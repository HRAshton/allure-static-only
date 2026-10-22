import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(root, "packages", "converter-sdk");
const sandbox = await mkdtemp(path.join(tmpdir(), "allure-sdk-consumer-"));
const run = (bin, args, cwd) =>
  execFileSync(bin, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();

try {
  const manifest = JSON.parse(await readFile(path.join(packagePath, "package.json"), "utf8"));
  if (manifest.private !== true || manifest.version !== "0.1.0-rc.1") {
    throw new Error("The M5c SDK must remain an unpublished, pinned candidate.");
  }

  const archive = JSON.parse(
    run(
      "npm",
      ["pack", packagePath, "--json", "--ignore-scripts", "--pack-destination", sandbox],
      root,
    ),
  );
  const entry = archive[0];
  if (!entry || typeof entry.filename !== "string") {
    throw new Error("npm pack did not produce an SDK archive.");
  }
  const packagedPaths = new Set(entry.files.map(({ path: filePath }) => filePath));
  for (const required of [
    "dist/sdk/index.js",
    "dist/sdk/index.d.ts",
    "dist/domain/validate-report.js",
    "dist/domain/report.d.ts",
  ]) {
    if (!packagedPaths.has(required)) {
      throw new Error(`Missing SDK package artifact: ${required}`);
    }
  }
  if ([...packagedPaths].some((filePath) => filePath.startsWith("dist/allure-adapter/"))) {
    throw new Error("Internal Allure UI adapters must not ship in the SDK.");
  }

  const consumer = path.join(sandbox, "independent-consumer");
  await mkdir(consumer);
  await writeFile(
    path.join(consumer, "package.json"),
    JSON.stringify({ name: "sdk-consumer-fixture", private: true, type: "module" }) + "\n",
  );
  run(
    "npm",
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      path.join(sandbox, entry.filename),
    ],
    consumer,
  );
  const javascript = `import {
  CONVERTER_API_VERSION, defineConverters, validateTestReport
} from "@allure-static-only/converter-sdk";

if (CONVERTER_API_VERSION !== 1) throw new Error("Bad SDK major version");
const converter = {
  id: "independent-example",
  apiVersion: 1,
  extensions: [".sample"],
  async detect(inputs) { return inputs.some((item) => item.path.endsWith(".sample")) ? 100 : 0; },
  async convert() {
    return {
      id: "external-report",
      sourceFormat: "independent-example",
      tests: [{
        id: "test-1", name: "built outside the source tree",
        status: "passed", labels: {}, steps: [], attachments: []
      }]
    };
  }
};
const registry = defineConverters({ apiVersion: 1, converters: [converter] });
if (registry.converters.length !== 1) throw new Error("Bad converter registry");
const report = await registry.converters[0].convert([], { isCancelled: () => false });
validateTestReport(report);
if (report.tests[0].status !== "passed") throw new Error("Bad conversion");
`;
  await writeFile(path.join(consumer, "smoke.mjs"), javascript);
  run("node", ["smoke.mjs"], consumer);

  const typescript = `import {
  CONVERTER_API_VERSION, defineConverters, validateTestReport,
  type Cancellation, type ReportConverter, type ReportInput, type TestReport
} from "@allure-static-only/converter-sdk";

const custom: ReportConverter = {
  id: "sample", apiVersion: CONVERTER_API_VERSION, extensions: [".sample"],
  async detect(inputs: readonly ReportInput[]): Promise<number> {
    return inputs.length > 0 ? 100 : 0;
  },
  async convert(_: readonly ReportInput[], cancellation: Cancellation): Promise<TestReport> {
    if (cancellation.isCancelled()) throw new Error("Cancelled");
    return { id: "sample", sourceFormat: "sample", tests: [] };
  }
};
const registry = defineConverters({ apiVersion: 1, converters: [custom] });
validateTestReport({ id: "test", sourceFormat: "sample", tests: [] });
void registry;
`;
  await writeFile(path.join(consumer, "types.ts"), typescript);
  run(
    path.join(root, "node_modules", ".bin", "tsc"),
    [
      "--strict",
      "--noEmit",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "types.ts",
    ],
    consumer,
  );
  console.log(
    `M5c offline npm pack/install + Node ESM and TypeScript consumer passed: ${entry.filename}`,
  );
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
