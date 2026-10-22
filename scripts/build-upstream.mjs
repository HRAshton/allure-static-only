import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(await readFile(path.join(root, "upstream.lock.json"), "utf8"));
const workspace = path.join(root, ".allure-workspace", "upstream");

const run = (bin, args, cwd = root) =>
  execFileSync(bin, args, {
    cwd,
    stdio: "inherit",
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, "--experimental-strip-types"]
        .filter(Boolean)
        .join(" "),
    },
  });

await mkdir(path.dirname(workspace), { recursive: true });
try {
  await readFile(path.join(workspace, ".git", "HEAD"), "utf8");
} catch {
  run("git", ["clone", "--filter=blob:none", "--no-checkout", lock.repository, workspace]);
}

run("git", ["checkout", "--detach", lock.commit], workspace);
const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim();
if (sha !== lock.commit || !/^[a-f0-9]{40}$/.test(sha)) {
  throw new Error("Allure upstream commit did not match upstream.lock.json.");
}

const dataSource = await readFile(path.join(workspace, lock.dataLoader), "utf8");
for (const identifier of ["allureReportData", "allureReportDataReady", "fetchReportJsonData"]) {
  if (!dataSource.includes(identifier)) {
    throw new Error(`Upstream removed the browser data contract: ${identifier}`);
  }
}

if (process.argv.includes("--probe")) {
  console.log(`Verified Allure frontend loading seam at ${sha}`);
  process.exit(0);
}

// Build-time dependency installation is explicitly permitted; NO Yarn/Node server in production.
run("corepack", ["yarn", "install", "--immutable"], workspace);
run("corepack", ["yarn", "build"], workspace);

// Assemble the static shell separately, so independently clean host builds can
// consume the same verified pinned upstream frontend snapshot.
run(process.execPath, ["scripts/assemble-static.mjs", path.join(workspace, lock.frontendAssets)]);
