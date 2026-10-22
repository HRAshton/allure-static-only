import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { staticContentType } from "./static-content-types.mjs";
import { CONTENT_SECURITY_POLICY, STATIC_SECURITY_HEADERS } from "./static-security.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const fixture = path.join(root, ".allure-workspace", "m1-fixture-report");
const requireUpstream = createRequire(
  path.join(root, ".allure-workspace", "upstream", "package.json"),
);
const { chromium, firefox } = requireUpstream("@playwright/test");
const browserEngine = process.env.BROWSER_ENGINE ?? "chromium";
if (browserEngine !== "chromium" && browserEngine !== "firefox") {
  throw new Error(`Unsupported browser engine: ${browserEngine}`);
}

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
      ...STATIC_SECURITY_HEADERS,
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
  browser =
    browserEngine === "firefox"
      ? await firefox.launch({ headless: true })
      : await chromium.launch({
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
  const dropTarget = page.locator("#allure-drop-target");
  if (
    (await dropTarget.getAttribute("role")) !== "button" ||
    (await dropTarget.getAttribute("tabindex")) !== "0"
  ) {
    throw new Error("Import drop target is not keyboard accessible.");
  }
  await dropTarget.focus();
  const focused = await page.evaluate(() => document.activeElement?.id);
  if (focused !== "allure-drop-target") {
    throw new Error("Import drop target cannot receive keyboard focus.");
  }
  await page.evaluate(() => {
    const picker = document.getElementById("allure-files-input");
    picker.click = () => {
      picker.dataset.keyboardClicks = String(Number(picker.dataset.keyboardClicks ?? 0) + 1);
    };
  });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  const pickerClicks = await page.evaluate(() => {
    const picker = document.getElementById("allure-files-input");
    const clicks = Number(picker.dataset.keyboardClicks ?? 0);
    delete picker.click;
    return clicks;
  });
  if (pickerClicks !== 2) {
    throw new Error(`Keyboard picker activation failed: ${pickerClicks}`);
  }
  await page.setViewportSize({ width: 360, height: 740 });
  const mobile = await page.locator("#allure-importer").boundingBox();
  if (!mobile || mobile.x < -1 || mobile.x + mobile.width > 361) {
    throw new Error(`Importer exceeds mobile viewport: ${JSON.stringify(mobile)}`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  const security = await page.evaluate(() => ({
    csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,
    bootstrap: [...document.scripts].some(
      (script) => script.getAttribute("src") === "./bootstrap.mjs",
    ),
    inlineScripts: [...document.scripts].filter((script) => !script.src).length,
  }));
  if (
    security.csp !== CONTENT_SECURITY_POLICY ||
    !security.bootstrap ||
    security.inlineScripts !== 0
  ) {
    throw new Error(`Expected external-only JavaScript under CSP: ${JSON.stringify(security)}`);
  }
  const response = await page.request.get(`http://127.0.0.1:${port}/`);
  if (response.headers()["content-security-policy"] !== CONTENT_SECURITY_POLICY) {
    throw new Error("Static host must enforce matching HTTP Content-Security-Policy.");
  }
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
  try {
    await page.getByText("Static Import", { exact: true }).first().click({ timeout: 10_000 });
  } catch (cause) {
    const markup = await page.locator("#app").innerText();
    throw new Error(
      `Upstream Allure UI unavailable under CSP; exceptions: ${errors.join("; ")}; console: ${consoleErrors.join("; ")}; DOM: ${markup.slice(0, 1600)}`,
      { cause },
    );
  }
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
  // The upstream tree may finish expanding after importer.hide; avoid racing its first render.
  try {
    await screenshotLeaf.waitFor({ state: "visible", timeout: 2_500 });
  } catch {
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
  const ctrfPage = await browser.newPage();
  const ctrfErrors = [];
  const ctrfOutgoing = [];
  ctrfPage.on("pageerror", (error) => ctrfErrors.push(error.message));
  ctrfPage.on("request", (request) => {
    if (
      !request.url().startsWith(`http://127.0.0.1:${port}/`) &&
      !request.url().startsWith("data:") &&
      !request.url().startsWith("blob:")
    ) {
      ctrfOutgoing.push(request.url());
    }
  });
  await ctrfPage.goto(`http://127.0.0.1:${port}/`);
  await ctrfPage.getByText("download a sample CTRF report").waitFor({ state: "visible" });
  await ctrfPage
    .locator("#allure-files-input")
    .setInputFiles(path.join(root, "fixtures", "demo-ctrf.json"));
  await ctrfPage.locator("#allure-importer").waitFor({ state: "hidden", timeout: 15_000 });
  const ctrfData = await ctrfPage.evaluate(() => {
    const data = window.allureReportData;
    const stats = JSON.parse(atob(data["widgets/statistic.json"]));
    const nav = JSON.parse(atob(data["widgets/nav.json"]));
    const docs = Object.keys(data)
      .filter((key) => key.startsWith("data/test-results/"))
      .map((key) => JSON.parse(atob(data[key])));
    const retry = docs.find((entry) => entry.name === "CTRF flaky retry" && !entry.isRetry);
    const pass = docs.find((entry) => entry.name === "CTRF checkout passes");
    return {
      stats,
      navCount: nav.length,
      retryCount: retry?.retriesCount,
      retryStatus: retry?.retries?.[0]?.status,
      duration: pass?.duration,
      firstStep: pass?.steps?.[0]?.name,
    };
  });
  if (
    ctrfData.stats.total !== 5 ||
    ctrfData.stats.passed !== 2 ||
    ctrfData.stats.failed !== 1 ||
    ctrfData.stats.skipped !== 1 ||
    ctrfData.stats.unknown !== 1 ||
    ctrfData.navCount !== 5 ||
    ctrfData.retryCount !== 1 ||
    ctrfData.retryStatus !== "failed" ||
    ctrfData.duration !== 250 ||
    ctrfData.firstStep !== "Fill billing details"
  ) {
    throw new Error(`CTRF mapping failed: ${JSON.stringify(ctrfData)}`);
  }
  await ctrfPage.getByText("Checkout", { exact: true }).first().waitFor({
    state: "visible",
    timeout: 12_000,
  });
  if (ctrfErrors.length || ctrfOutgoing.length) {
    throw new Error(
      `CTRF browser errors: ${ctrfErrors.join("; ")}; external: ${ctrfOutgoing.join("; ")}`,
    );
  }
  console.log("M4b browser smoke passed: CTRF status, retries, steps and no uploads.");

  // Exercise an HTML-looking test name in the real upstream UI, not only the converter model.
  const adversarialPage = await browser.newPage();
  const adversarialErrors = [];
  const adversarialOutgoing = [];
  adversarialPage.on("pageerror", (error) => adversarialErrors.push(error.message));
  adversarialPage.on("request", (request) => {
    if (
      !request.url().startsWith(`http://127.0.0.1:${port}/`) &&
      !request.url().startsWith("data:") &&
      !request.url().startsWith("blob:")
    ) {
      adversarialOutgoing.push(request.url());
    }
  });
  await adversarialPage.goto(`http://127.0.0.1:${port}/`);
  const htmlLookingName = '<img src=x onerror="window.__reportXss=1">';
  const adversarialXml = [
    '<testsuite name="Adversarial">',
    '<testcase name="&lt;img src=x onerror=&quot;window.__reportXss=1&quot;&gt;"/>',
    "</testsuite>",
  ].join("");
  await adversarialPage.locator("#allure-files-input").setInputFiles({
    name: "adversarial.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(adversarialXml),
  });
  await adversarialPage.locator("#allure-importer").waitFor({
    state: "hidden",
    timeout: 15_000,
  });
  const suite = adversarialPage.getByText("Adversarial", { exact: true }).first();
  await suite.waitFor({ state: "visible", timeout: 15_000 });
  await suite.click();
  await adversarialPage.getByText(htmlLookingName, { exact: true }).first().waitFor({
    state: "visible",
    timeout: 15_000,
  });
  const injectionState = await adversarialPage.evaluate(() => ({
    executed: window.__reportXss === 1,
    htmlNode: Boolean(document.querySelector('img[onerror*="__reportXss"]')),
    reportName: Object.keys(window.allureReportData)
      .filter((key) => key.startsWith("data/test-results/"))
      .map((key) => JSON.parse(atob(window.allureReportData[key])).name)[0],
  }));
  if (
    injectionState.executed ||
    injectionState.htmlNode ||
    injectionState.reportName !== htmlLookingName ||
    adversarialErrors.length ||
    adversarialOutgoing.length
  ) {
    throw new Error(
      `Unsafe HTML-looking report: ${JSON.stringify(injectionState)}; errors: ${adversarialErrors.join("; ")}; external: ${adversarialOutgoing.join("; ")}`,
    );
  }
  console.log(`${browserEngine} CSP and HTML-looking test-name regression passed.`);

  // M6f: hostile report attachments remain binary-only even when a report
  // lies about their type; uploaded SVG/HTML must never execute in the page.
  const attachmentPage = await browser.newPage();
  const attachmentErrors = [];
  const attachmentOutgoing = [];
  attachmentPage.on("pageerror", (error) => attachmentErrors.push(error.message));
  attachmentPage.on("request", (request) => {
    if (
      !request.url().startsWith(`http://127.0.0.1:${port}/`) &&
      !request.url().startsWith("data:") &&
      !request.url().startsWith("blob:")
    ) {
      attachmentOutgoing.push(request.url());
    }
  });
  await attachmentPage.goto(`http://127.0.0.1:${port}/`);
  const attachmentReport = {
    uuid: "m6f-attachment-case",
    name: "M6f hostile attachment test",
    status: "passed",
    labels: [{ name: "suite", value: "Attachment isolation" }],
    attachments: [
      { name: "SVG script", source: "attack.svg", type: "image/svg+xml" },
      { name: "Mislabeled HTML", source: "attack.html", type: "image/png" },
    ],
  };
  const svgPayload = '<svg xmlns="http://www.w3.org/2000/svg" onload="window.__attachmentXss=1"/>';
  const htmlPayload = '<script>window.__attachmentXss=1</script>';
  await attachmentPage.locator("#allure-files-input").setInputFiles([
    {
      name: "m6f-result.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(attachmentReport)),
    },
    { name: "attack.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svgPayload) },
    { name: "attack.html", mimeType: "text/html", buffer: Buffer.from(htmlPayload) },
  ]);
  await attachmentPage.locator("#allure-importer").waitFor({ state: "hidden", timeout: 20_000 });
  await attachmentPage.getByText("Attachment isolation", { exact: true }).first().waitFor({
    state: "visible",
    timeout: 15_000,
  });
  const attachmentState = await attachmentPage.evaluate(() => {
    const loaded = window.allureReportData;
    const doc = JSON.parse(atob(loaded["data/test-results/test-0.json"]));
    const links = doc.attachments.map((entry) => entry.link);
    return {
      links,
      payloads: links.map((link) => loaded[`data/attachments/${link.id}${link.ext}`]),
      executed: window.__attachmentXss === 1,
      activeNodes: document.querySelectorAll("script[onload], svg[onload], iframe[srcdoc]").length,
    };
  });
  if (
    attachmentState.links.length !== 2 ||
    attachmentState.links.some(
      (link) => link.contentType !== "application/octet-stream" || link.ext !== "",
    ) ||
    attachmentState.payloads[0] !== Buffer.from(svgPayload).toString("base64") ||
    attachmentState.payloads[1] !== Buffer.from(htmlPayload).toString("base64") ||
    attachmentState.executed ||
    attachmentState.activeNodes ||
    attachmentErrors.length ||
    attachmentOutgoing.length
  ) {
    throw new Error(
      `Hostile attachment browser regression: ${JSON.stringify(attachmentState)}; errors: ${attachmentErrors.join("; ")}; outgoing: ${attachmentOutgoing.join("; ")}`,
    );
  }
  console.log(`${browserEngine} hostile SVG/HTML attachment isolation passed.`);

  // M6e: local imports must still work after the shell and trusted converter
  // modules have loaded, with all subsequent HTTP networking disabled.
  const offlineCases = [
    { name: "generated", input: "#allure-input", fixture, suite: "Static Import", count: 1 },
    {
      name: "junit",
      input: "#allure-files-input",
      fixture: path.join(root, "fixtures", "demo-junit.xml"),
      suite: "Authentication",
      count: 6,
    },
  ];
  for (const testCase of offlineCases) {
    const context = await browser.newContext();
    try {
      const localPage = await context.newPage();
      const failures = [];
      const errors = [];
      localPage.on("requestfailed", (request) => failures.push(request.url()));
      localPage.on("pageerror", (error) => errors.push(error.message));
      await localPage.goto(`http://127.0.0.1:${port}/`);
      await localPage.waitForLoadState("networkidle");
      await context.setOffline(true);
      await localPage.locator(testCase.input).setInputFiles(testCase.fixture);
      await localPage.locator("#allure-importer").waitFor({
        state: "hidden",
        timeout: 20_000,
      });
      await localPage.getByText(testCase.suite, { exact: true }).first().waitFor({
        state: "visible",
        timeout: 15_000,
      });
      const offlineState = await localPage.evaluate(() => ({
        ready: window.allureReportDataReady,
        totals: JSON.parse(atob(window.allureReportData["widgets/statistic.json"])).total,
      }));
      if (
        offlineState.ready !== true ||
        offlineState.totals !== testCase.count ||
        failures.length > 0 ||
        errors.length > 0
      ) {
        throw new Error(
          `Offline ${testCase.name} import failed: ${JSON.stringify(offlineState)}; HTTP failures: ${failures.join("; ")}; page errors: ${errors.join("; ")}`,
        );
      }
      console.log(`${browserEngine} offline-after-load ${testCase.name} import passed.`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
