import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { staticContentType } from "./static-content-types.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const fixture = path.join(root, ".allure-workspace", "m1-fixture-report");
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
    executablePath: process.env.CHROME_BIN ?? "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  const outgoing = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
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
  await page.locator("#allure-input").setInputFiles(fixture);
  try {
    await page.waitForFunction(
      () =>
        document.getElementById("allure-importer")?.hidden ||
        Boolean(document.getElementById("allure-import-error")?.textContent),
      undefined,
      { timeout: 30_000 },
    );
  } catch (cause) {
    const details = await page.locator("#allure-input").evaluate((input) => ({
      count: input.files?.length ?? 0,
      paths: Array.from(input.files ?? [])
        .slice(0, 3)
        .map((file) => file.webkitRelativePath),
    }));
    throw new Error(
      `Importer did not finish: ${JSON.stringify(details)}; errors: ${errors.join("; ")}; console: ${consoleErrors.join("; ")}`,
      { cause },
    );
  }
  const importError = await page.locator("#allure-import-error").textContent();
  if (importError?.trim()) {
    throw new Error(
      `Browser import failed: ${importError.trim()}; console: ${consoleErrors.join("; ")}`,
    );
  }
  await page.locator("#allure-importer").waitFor({ state: "hidden", timeout: 2_000 });
  await page.getByText("M1 browser fixture passing test", { exact: false }).first().waitFor({
    state: "visible",
    timeout: 60_000,
  });
  if (errors.length || outgoing.length || consoleErrors.length) {
    throw new Error(
      `Browser errors: ${errors.join("; ")}; console: ${consoleErrors.join("; ")}; external requests: ${outgoing.join("; ")}`,
    );
  }
  console.log("M1 browser smoke passed: real Allure UI rendered a locally imported fixture.");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
