import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { staticContentType } from "./static-content-types.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const requireUpstream = createRequire(
  path.join(root, ".allure-workspace", "upstream", "package.json"),
);
const { chromium } = requireUpstream("@playwright/test");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const target = path.resolve(dist, `.${pathname}`);
  if (target !== dist && !target.startsWith(dist + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (!(await stat(target)).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "content-type": staticContentType(target),
      "cache-control": "no-store",
    });
    res.end(await readFile(target));
  } catch {
    res.writeHead(404).end();
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN ?? "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const errors = [];
  const outgoing = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      !request.url().startsWith(`http://127.0.0.1:${port}/`) &&
      !request.url().startsWith("data:") &&
      !request.url().startsWith("blob:")
    ) {
      outgoing.push(request.url());
    }
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page
    .locator("#allure-files-input")
    .setInputFiles(path.join(root, "examples", "company-adapter", "example.company.json"));
  await page.locator("#allure-importer").waitFor({ state: "hidden", timeout: 30_000 });
  const data = await page.evaluate(() => {
    const all = window.allureReportData;
    const stats = JSON.parse(atob(all["widgets/statistic.json"]));
    const docs = Object.keys(all)
      .filter((key) => key.startsWith("data/test-results/"))
      .map((key) => JSON.parse(atob(all[key])));
    return { stats, docs };
  });
  if (
    data.stats.total !== 3 ||
    data.stats.passed !== 1 ||
    data.stats.failed !== 1 ||
    data.stats.skipped !== 1 ||
    data.docs.length !== 3 ||
    data.docs.find((item) => item.name.includes("<script>"))?.status !== "failed" ||
    data.docs.find((item) => item.name.includes("passing"))?.duration !== 42
  ) {
    throw new Error(`External adapter mapping error: ${JSON.stringify(data)}`);
  }
  await page.getByText("External adapter demo", { exact: true }).first().waitFor({
    state: "visible",
    timeout: 15_000,
  });
  if (errors.length || outgoing.length) {
    throw new Error(
      `Browser errors: ${errors.join("; ")}; external requests: ${outgoing.join("; ")}`,
    );
  }
  console.log("External converter passed in real upstream Allure UI without report uploads.");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
