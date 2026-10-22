import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireUpstream = createRequire(
  path.join(root, ".allure-workspace", "upstream", "package.json"),
);
// The Yarn workspace does not expose a root 'playwright' binary, but the
// browser test harness already resolves @playwright/test from this location.
// Resolve Playwright through that dependency instead of downloading a second version.
const requireTest = createRequire(requireUpstream.resolve("@playwright/test"));
const playwrightManifest = requireTest.resolve("playwright/package.json");
const playwrightCli = path.join(path.dirname(playwrightManifest), "cli.js");
const child = spawnSync(process.execPath, [playwrightCli, "install", "--with-deps", "firefox"], {
  stdio: "inherit",
  env: process.env,
});
if (child.error) {
  throw child.error;
}
if (child.status !== 0) {
  throw new Error(`Playwright Firefox installation failed: exit ${child.status}`);
}
