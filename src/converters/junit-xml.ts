import type { TestCase, TestReport, TestStatus } from "../domain/report.ts";
import type { Cancellation, ReportConverter, ReportInput } from "./contract.ts";

const MAX_XML_BYTES = 8 * 1024 * 1024;
const MAX_TESTS = 2_000;
const MAX_MESSAGE = 4_096;
const xmlFile = /\.xml$/i;
const junitRoot =
  /^\s*(?:<\?xml[^?]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:testsuite|testsuites)(?:\s|>)/i;

export class InvalidJUnitError extends Error {
  constructor(path: string, reason: string) {
    super(`Invalid JUnit XML ${path}: ${reason}`);
    this.name = "InvalidJUnitError";
  }
}

function direct(element: Element, localName: string): Element[] {
  return Array.from(element.children).filter((child) => child.localName === localName);
}

function attribute(element: Element, key: string): string | undefined {
  const value = element.getAttribute(key);
  return value === null || value.trim() === "" ? undefined : value;
}

function duration(element: Element, path: string): number | undefined {
  const raw = attribute(element, "time");
  if (raw === undefined) {
    return undefined;
  }
  const seconds = Number(raw);
  const milliseconds = seconds * 1_000;
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(milliseconds)) {
    throw new InvalidJUnitError(path, `invalid testcase time "${raw}"`);
  }
  return milliseconds;
}

function failureMessage(element: Element): string | undefined {
  const explicit = attribute(element, "message");
  const value = explicit ?? element.textContent?.trim();
  return value ? value.slice(0, MAX_MESSAGE) : undefined;
}

function testStatus(testCase: Element): {
  status: TestStatus;
  message?: string;
} {
  const failed = direct(testCase, "failure")[0];
  const broken = direct(testCase, "error")[0];
  const skipped = direct(testCase, "skipped")[0];
  const problem = failed ?? broken ?? skipped;
  const status: TestStatus = failed ? "failed" : broken ? "broken" : skipped ? "skipped" : "passed";
  const message = problem ? failureMessage(problem) : undefined;
  return { status, ...(message ? { message } : {}) };
}

function parseDocument(xml: string, path: string): Document {
  // Never accept user-authored DTDs or entities. DOMParser is browser-local.
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new InvalidJUnitError(path, "DOCTYPE and entities are not supported");
  }
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const root = document.documentElement;
  if (
    document.doctype ||
    !root ||
    (root.localName !== "testsuite" && root.localName !== "testsuites") ||
    document.getElementsByTagName("parsererror").length > 0
  ) {
    throw new InvalidJUnitError(path, "malformed XML or unsupported root element");
  }
  return document;
}

function gatherSuite(
  suite: Element,
  file: string,
  parent: readonly string[],
  tests: TestCase[],
  count: { value: number },
): void {
  const name = attribute(suite, "name") ?? "JUnit suite";
  const path = [...parent, name];
  for (const testcase of direct(suite, "testcase")) {
    count.value += 1;
    if (count.value > MAX_TESTS) {
      throw new InvalidJUnitError(file, "too many test cases");
    }
    const testName = attribute(testcase, "name");
    if (!testName) {
      throw new InvalidJUnitError(file, "testcase requires a nonempty name");
    }
    const className = attribute(testcase, "classname");
    const time = duration(testcase, file);
    const status = testStatus(testcase);
    tests.push({
      id: `${file}:${count.value}`,
      name: testName,
      ...(className ? { fullName: `${className}.${testName}` } : {}),
      ...status,
      ...(time === undefined ? {} : { durationMs: time }),
      labels: {
        suite: [name],
        ...(path.length > 1 ? { parentSuite: [path.slice(0, -1).join(" / ")] } : {}),
        ...(className ? { package: [className] } : {}),
      },
      steps: [],
      attachments: [],
    });
  }
  for (const child of direct(suite, "testsuite")) {
    gatherSuite(child, file, path, tests, count);
  }
}

export const junitXmlConverter: ReportConverter = {
  id: "junit-xml",
  apiVersion: 1,
  extensions: [".xml"],
  async detect(inputs: readonly ReportInput[]): Promise<number> {
    for (const input of inputs) {
      if (!xmlFile.test(input.path) || input.byteLength > MAX_XML_BYTES) {
        continue;
      }
      const prefix = new TextDecoder("utf-8", { fatal: true }).decode(
        (await input.read()).subarray(0, 4_096),
      );
      if (junitRoot.test(prefix)) {
        return 95;
      }
    }
    return 0;
  },
  async convert(inputs: readonly ReportInput[], cancellation: Cancellation): Promise<TestReport> {
    const candidates = inputs.filter(({ path }) => xmlFile.test(path));
    if (!candidates.length) {
      throw new Error("No JUnit XML files found.");
    }
    const tests: TestCase[] = [];
    const count = { value: 0 };
    for (const file of [...candidates].sort((a, b) => a.path.localeCompare(b.path))) {
      if (cancellation.isCancelled()) {
        throw new Error("JUnit conversion cancelled.");
      }
      if (file.byteLength > MAX_XML_BYTES) {
        throw new InvalidJUnitError(file.path, "file exceeds 8 MiB limit");
      }
      let xml: string;
      try {
        xml = new TextDecoder("utf-8", { fatal: true }).decode(await file.read());
      } catch {
        throw new InvalidJUnitError(file.path, "invalid UTF-8");
      }
      if (cancellation.isCancelled()) {
        throw new Error("JUnit conversion cancelled.");
      }
      const document = parseDocument(xml, file.path);
      const root = document.documentElement;
      if (root.localName === "testsuite") {
        gatherSuite(root, file.path, [], tests, count);
      } else {
        for (const suite of direct(root, "testsuite")) {
          gatherSuite(suite, file.path, [], tests, count);
        }
      }
    }
    return { id: "imported-junit-xml", sourceFormat: "junit-xml", tests };
  },
};
