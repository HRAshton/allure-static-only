import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(await readFile(path.join(root, "upstream.lock.json"), "utf8"));
const workspace = path.join(root, ".allure-workspace", "upstream");
const dist = path.join(root, "dist");

const run = (bin, args, cwd = root) =>
  execFileSync(bin, args, { cwd, stdio: "inherit", maxBuffer: 10 * 1024 * 1024 });

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

await mkdir(dist, { recursive: true });
await cp(path.join(workspace, lock.frontendAssets), dist, { recursive: true, force: true });
await cp(path.join(root, "src", "shell", "import-generated.mjs"), path.join(dist, "import-generated.mjs"));

const manifest = JSON.parse(await readFile(path.join(dist, "manifest.json"), "utf8"));
const appScript = manifest["main.js"];
const appCss = manifest["main.css"];
const cssTag = typeof appCss === "string" ? `<link rel="stylesheet" href="./${appCss}" />` : "";
if (typeof appScript !== "string" || !/^app-[a-f0-9]+\.js$/.test(appScript)) {
  throw new Error("Unexpected upstream webpack main.js manifest entry.");
}
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <base href="./" />
    <title>Allure Static Only</title>
    ${cssTag}
    <script>
      window.allureReportData = {};
      window.allureReportDataReady = false;
      window.allureReportOptions = {
        reportName: "Allure Static Only",
        reportLanguage: "en",
        theme: "auto",
        layout: "split",
        groupBy: ["parentSuite", "suite", "subSuite"],
        sections: ["charts", "timeline", "metrics"],
      };
    </script>
    <script type="module" src="./import-generated.mjs"></script>
    <script defer src="./${appScript}"></script>
  </head>
  <body>
    <main id="allure-importer">
      <h1>Open a generated Allure Awesome report</h1>
      <p>M1 proof: select a generated report directory containing widgets/ and data/.
         Raw allure-results import will come in M3.</p>
      <label for="allure-input">Report directory</label>
      <input id="allure-input" type="file" webkitdirectory multiple />
      <p id="allure-import-error" role="alert"></p>
    </main>
    <div id="app"></div>
  </body>
</html>
`;
await writeFile(path.join(dist, "index.html"), html, "utf8");
console.log("Built static Allure shell in dist/; serve with Nginx for the browser smoke test.");
