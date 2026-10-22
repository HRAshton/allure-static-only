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
  const createdAt = await page.evaluate(() => window.allureReportOptions.createdAt);
  if (!Number.isFinite(createdAt) || Number.isNaN(new Date(createdAt).getTime())) {
    throw new Error("Static Allure bootstrap has no valid createdAt timestamp.");
  }
  const invalidDrop = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["invalid"], "notes.txt"));
    return transfer;
  });
  await page.locator("#allure-drop-target").dispatchEvent("drop", {
    dataTransfer: invalidDrop,
  });
  await page.waitForFunction(() =>
    document.getElementById("allure-import-error")?.textContent.includes("No converter recognizes"),
  );
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
  // The upstream tree initially renders the suite in a collapsed state.
  await page.getByText("Static Import", { exact: true }).first().click();
  try {
    await page.getByText("M1 browser fixture passing test", { exact: false }).first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
  } catch (cause) {
    const state = await page.evaluate(() => ({
      reportDataReady: window.allureReportDataReady,
      loadedPaths: Object.keys(window.allureReportData ?? {}).slice(0, 30),
      renderedText: document.getElementById("app")?.innerText.slice(0, 2_000),
      appMarkup: document.getElementById("app")?.innerHTML.slice(0, 500),
      url: window.location.href,
    }));
    throw new Error(
      [
        `Upstream UI fixture not visible: ${JSON.stringify(state)}`,
        `page errors: ${errors.join("; ")}`,
        `console: ${consoleErrors.join("; ")}`,
        `outgoing: ${outgoing.join("; ")}`,
      ].join("\n"),
      { cause },
    );
  }
  if (errors.length || outgoing.length || consoleErrors.length) {
    throw new Error(
      `Browser errors: ${errors.join("; ")}; console: ${consoleErrors.join("; ")}; external requests: ${outgoing.join("; ")}`,
    );
  }
  const rawPage = await browser.newPage();
  const rawErrors = [];
  const rawOutgoing = [];
  rawPage.on("pageerror", (error) => rawErrors.push(error.message));
  rawPage.on("request", (request) => {
    if (
      !request.url().startsWith(`http://127.0.0.1:${port}/`) &&
      !request.url().startsWith("data:") &&
      !request.url().startsWith("blob:")
    ) {
      rawOutgoing.push(request.url());
    }
  });
  await rawPage.goto(`http://127.0.0.1:${port}/`);
  await rawPage
    .locator("#allure-input")
    .setInputFiles(path.join(root, ".allure-workspace", "m1-fixture-results"));
  await rawPage.locator("#allure-importer").waitFor({ state: "hidden", timeout: 15_000 });
  try {
    await rawPage.getByText("Static Import", { exact: true }).first().click();
    await rawPage.getByText("M1 browser fixture passing test").first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
  } catch (cause) {
    const text = await rawPage.locator("#app").innerText();
    throw new Error(
      `Raw Allure result not visible: ${text.slice(0, 1_000)}; errors: ${rawErrors.join("; ")}`,
      { cause },
    );
  }
  if (rawErrors.length || rawOutgoing.length) {
    throw new Error(
      `Raw import errors: ${rawErrors.join("; ")}; uploads: ${rawOutgoing.join("; ")}`,
    );
  }
  const zipPage = await browser.newPage();
  const zipErrors = [];
  const zipOutgoing = [];
  zipPage.on("pageerror", (error) => zipErrors.push(error.message));
  zipPage.on("request", (request) => {
    if (
      !request.url().startsWith(`http://127.0.0.1:${port}/`) &&
      !request.url().startsWith("data:") &&
      !request.url().startsWith("blob:")
    ) {
      zipOutgoing.push(request.url());
    }
  });
  await zipPage.goto(`http://127.0.0.1:${port}/`);
  await zipPage
    .locator("#allure-files-input")
    .setInputFiles(path.join(root, ".allure-workspace", "m3-fixture.zip"));
  await zipPage.locator("#allure-importer").waitFor({ state: "hidden", timeout: 15_000 });
  try {
    await zipPage.getByText("Static Import", { exact: true }).first().click();
    await zipPage.getByText("M1 browser fixture passing test").first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
  } catch (cause) {
    const rendered = await zipPage.locator("#app").innerText();
    throw new Error(
      `ZIP report not visible: ${rendered.slice(0, 1_000)}; errors: ${zipErrors.join("; ")}`,
      { cause },
    );
  }
  if (zipErrors.length || zipOutgoing.length) {
    throw new Error(
      `ZIP import errors: ${zipErrors.join("; ")}; uploads: ${zipOutgoing.join("; ")}`,
    );
  }
  const richerPage = await browser.newPage();
  const richErrors = [];
  const richOutgoing = [];
  richerPage.on("pageerror", (error) => richErrors.push(error.message));
  richerPage.on("request", (request) => {
    if (
      !request.url().startsWith(`http://127.0.0.1:${port}/`) &&
      !request.url().startsWith("data:") &&
      !request.url().startsWith("blob:")
    ) {
      richOutgoing.push(request.url());
    }
  });
  await richerPage.goto(`http://127.0.0.1:${port}/`);
  await richerPage
    .locator("#allure-files-input")
    .setInputFiles(path.join(root, ".allure-workspace", "m3-complex.zip"));
  await richerPage.locator("#allure-importer").waitFor({ state: "hidden", timeout: 15_000 });
  const dataCheck = await richerPage.evaluate(() => {
    const data = window.allureReportData;
    const stats = JSON.parse(atob(data["widgets/statistic.json"]));
    const nav = JSON.parse(atob(data["widgets/nav.json"]));
    const docs = Object.keys(data)
      .filter((key) => key.startsWith("data/test-results/"))
      .map((key) => JSON.parse(atob(data[key])));
    const screenshot = docs.find((doc) => doc.name === "M3 screenshot test");
    const retry = docs.find((doc) => doc.name === "M3 flaky test" && !doc.isRetry);
    const nested = screenshot?.steps[0]?.steps[0];
    const attachment = nested?.steps.find((step) => step.type === "attachment")?.link;
    const image = attachment
      ? data[`data/attachments/${attachment.id}${attachment.ext}`]
      : undefined;
    return {
      stats,
      navCount: nav.length,
      nestedName: nested?.name,
      attachment: attachment?.contentType,
      imageSignature: image ? atob(image).slice(0, 4) : null,
      retryCount: retry?.retriesCount,
      retryStatus: retry?.retries?.[0]?.status,
    };
  });
  if (
    dataCheck.stats.total !== 4 ||
    dataCheck.stats.passed !== 2 ||
    dataCheck.stats.failed !== 1 ||
    dataCheck.stats.skipped !== 1 ||
    dataCheck.navCount !== 4 ||
    dataCheck.nestedName !== "Inner screenshot step" ||
    dataCheck.attachment !== "image/png" ||
    dataCheck.imageSignature !== "\x89PNG" ||
    dataCheck.retryCount !== 1 ||
    dataCheck.retryStatus !== "failed"
  ) {
    throw new Error(`M3 complex result normalization failed: ${JSON.stringify(dataCheck)}`);
  }
  const screenshotLeaf = richerPage.getByText("M3 screenshot test", { exact: false }).first();
  if (!(await screenshotLeaf.isVisible())) {
    await richerPage.getByText("M3 Validation", { exact: true }).first().click();
  }
  try {
    await screenshotLeaf.waitFor({ state: "visible", timeout: 12_000 });
    await screenshotLeaf.click();
    await richerPage.getByText("Outer screenshot step", { exact: false }).first().waitFor({
      state: "visible",
      timeout: 12_000,
    });
  } catch (cause) {
    const markup = await richerPage.locator("#app").innerText();
    throw new Error(
      `M3 result leaf not visible: ${markup.slice(0, 2_000)}; errors: ${richErrors.join("; ")}`,
      { cause },
    );
  }
  if (richErrors.length || richOutgoing.length) {
    throw new Error(
      `Complex ZIP errors: ${richErrors.join("; ")}; requests: ${richOutgoing.join("; ")}`,
    );
  }
  console.log("M3 browser smoke passed: raw JSON, ZIP, statuses, retries, steps and PNG.");

  // M4: the Pages demo's public sample must render a real JUnit report in the upstream UI.
  const junitPage = await browser.newPage();
  const junitErrors = [];
  const junitOutgoing = [];
  junitPage.on("pageerror", (error) => junitErrors.push(error.message));
  junitPage.on("request", (request) => {
    if (
      !request.url().startsWith(`http://127.0.0.1:${port}/`) &&
      !request.url().startsWith("data:") &&
      !request.url().startsWith("blob:")
    ) {
      junitOutgoing.push(request.url());
    }
  });
  await junitPage.goto(`http://127.0.0.1:${port}/`);
  await junitPage.getByText("Download a sample JUnit report").waitFor({ state: "visible" });
  await junitPage
    .locator("#allure-files-input")
    .setInputFiles(path.join(root, "fixtures", "demo-junit.xml"));
  await junitPage.locator("#allure-importer").waitFor({ state: "hidden", timeout: 15_000 });
  const junitData = await junitPage.evaluate(() => {
    const data = window.allureReportData;
    const stats = JSON.parse(atob(data["widgets/statistic.json"]));
    const nav = JSON.parse(atob(data["widgets/nav.json"]));
    const docs = Object.keys(data)
      .filter((key) => key.startsWith("data/test-results/"))
      .map((key) => JSON.parse(atob(data[key])));
    return {
      stats,
      navCount: nav.length,
      failure: docs.find((entry) => entry.name === "rejects invalid password")?.error?.message,
      checkout: docs.find((entry) => entry.name === "charges the card")?.duration,
      escaped: docs.find((entry) => entry.name === "escapes <script> text")?.name,
    };
  });
  if (
    junitData.stats.total !== 6 ||
    junitData.stats.passed !== 3 ||
    junitData.stats.failed !== 1 ||
    junitData.stats.skipped !== 1 ||
    junitData.stats.broken !== 1 ||
    junitData.navCount !== 6 ||
    junitData.failure !== "Expected an error banner" ||
    junitData.checkout !== 1250 ||
    junitData.escaped !== "escapes <script> text"
  ) {
    throw new Error(`JUnit mapping failed: ${JSON.stringify(junitData)}`);
  }
  // Multiple suites can start collapsed. Assert actual upstream UI grouping,
  // and verify test details in the decoded Awesome data contract above.
  await junitPage.getByText("Authentication", { exact: true }).first().waitFor({
    state: "visible",
    timeout: 12_000,
  });
  await junitPage.getByText("Checkout", { exact: true }).first().waitFor({
    state: "visible",
    timeout: 12_000,
  });
  if (junitErrors.length || junitOutgoing.length) {
    throw new Error(
      `JUnit browser errors: ${junitErrors.join("; ")}; external: ${junitOutgoing.join("; ")}`,
    );
  }
  console.log("M4 browser smoke passed: six JUnit cases, native UI, no network upload.");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
