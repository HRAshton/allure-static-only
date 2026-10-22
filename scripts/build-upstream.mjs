import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(await readFile(path.join(root, "upstream.lock.json"), "utf8"));
const workspace = path.join(root, ".allure-workspace", "upstream");
const dist = path.join(root, "dist");

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

await mkdir(dist, { recursive: true });
await cp(path.join(workspace, lock.frontendAssets), dist, { recursive: true, force: true });
for (const moduleName of ["browser-import.mjs", "import-generated.mjs"]) {
  await cp(path.join(root, "src", "shell", moduleName), path.join(dist, moduleName));
}
run("npm", ["run", "build:browser"]);
await mkdir(path.join(dist, "demo"), { recursive: true });
await cp(
  path.join(root, "fixtures", "demo-junit.xml"),
  path.join(dist, "demo", "junit-sample.xml"),
);

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
    <link rel="icon" href="data:," />
    ${cssTag}
    <script>
      window.allureReportData = {};
      window.allureReportDataReady = false;
      window.allureReportOptions = {
        id: "awesome",
        reportName: "Allure Static Only",
        logo: "",
        reportLanguage: "en",
        theme: "auto",
        createdAt: Date.now(),
        reportUuid: "00000000-0000-4000-8000-000000000001",
        allureVersion: "3.21.0",
        cacheKey: "m1",
        layout: "split",
        defaultSection: "",
        groupBy: ["parentSuite", "suite", "subSuite"],
        sections: ["charts", "timeline", "metrics"],
      };
      window.allure = window.allure || {};
    </script>
    <script type="module" src="./import-generated.mjs"></script>
    <script defer src="./${appScript}"></script>
  </head>
  <body>
    <main id="allure-importer">
      <h1>Allure Static Demo</h1>
      <p>Drop JUnit XML or native Allure results here, or select a file or directory.
         Reports are processed in your browser and never uploaded.</p>
      <p><a href="./demo/junit-sample.xml" download="junit-sample.xml">
         Download a sample JUnit report</a> to try the importer.</p>
      <div id="allure-drop-target" role="region" aria-label="Drop report files">
        <p>Drop report files here or select a directory.</p>
      </div>
      <label for="allure-input">Report directory</label>
      <input id="allure-input" type="file" webkitdirectory multiple />
      <label for="allure-files-input">Individual files</label>
      <input id="allure-files-input" type="file" multiple />
      <button id="allure-cancel" type="button" hidden>Cancel import</button>
      <p id="allure-import-progress" role="status" aria-live="polite"></p>
      <p id="allure-import-error" role="alert"></p>
    </main>
    <div id="app"></div>
  </body>
</html>
`;
await writeFile(path.join(dist, "index.html"), html, "utf8");
console.log("Built static Allure shell in dist/; serve with Nginx for the browser smoke test.");
