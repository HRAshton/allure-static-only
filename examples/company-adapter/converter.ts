import type {
  Cancellation,
  ReportConverter,
  ReportInput,
  TestCase,
  TestReport,
} from "../../src/sdk/index.ts";

const FORMAT = "acme.test-report.v1";
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_TESTS = 1000;
const statuses = new Set(["passed", "failed", "broken", "skipped", "unknown"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSource(content: Uint8Array, path: string): Record<string, unknown> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content));
  } catch {
    throw new Error(`Invalid company report ${path}: UTF-8 JSON required.`);
  }
  if (!record(decoded) || decoded.kind !== FORMAT) {
    throw new Error(`Invalid company report ${path}: missing ${FORMAT} marker.`);
  }
  return decoded;
}

function active(cancellation: Cancellation): void {
  if (cancellation.isCancelled()) {
    throw new Error("Company import cancelled.");
  }
}

/**
 * An example downstream source converter. It imports only the public v1 SDK types.
 * The trusted Docker overlay copies this file to src/extensions/company-results.ts.
 */
export const companyResultsConverter: ReportConverter = {
  id: "company-example",
  apiVersion: 1,
  extensions: [".company.json"],
  async detect(inputs: readonly ReportInput[]): Promise<number> {
    for (const input of inputs) {
      if (!input.path.endsWith(".company.json") || input.byteLength > MAX_JSON_BYTES) {
        continue;
      }
      try {
        const parsed = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(await input.read()),
        ) as unknown;
        if (record(parsed) && parsed.kind === FORMAT) {
          return 98;
        }
      } catch {
        // Not this report format; let other registered converters detect it.
      }
    }
    return 0;
  },
  async convert(inputs: readonly ReportInput[], cancellation: Cancellation): Promise<TestReport> {
    const matches = inputs.filter((input) => input.path.endsWith(".company.json"));
    const tests: TestCase[] = [];
    active(cancellation);
    if (!matches.length) {
      throw new Error("No company reports were selected.");
    }
    for (const input of matches) {
      active(cancellation);
      if (input.byteLength > MAX_JSON_BYTES) {
        throw new Error("Company report exceeds the 1 MiB file limit.");
      }
      const document = parseSource(await input.read(), input.path);
      active(cancellation);
      if (!Array.isArray(document.tests) || document.tests.length > MAX_TESTS) {
        throw new Error("Company report tests must be an array of at most 1000 items.");
      }
      for (const [index, item] of document.tests.entries()) {
        active(cancellation);
        if (
          !record(item) ||
          typeof item.name !== "string" ||
          !item.name.trim() ||
          typeof item.status !== "string" ||
          !statuses.has(item.status)
        ) {
          throw new Error(`Company report ${input.path}: invalid test at index ${index}.`);
        }
        const durationMs = item.durationMs;
        if (
          durationMs !== undefined &&
          (!Number.isSafeInteger(durationMs) || (durationMs as number) < 0)
        ) {
          throw new Error(`Company report ${input.path}: invalid duration at ${index}.`);
        }
        if (item.message !== undefined && typeof item.message !== "string") {
          throw new Error("Company report message must be text.");
        }
        tests.push({
          id: `${input.path}#${index}`,
          name: item.name,
          status: item.status as TestCase["status"],
          ...(durationMs === undefined ? {} : { durationMs: durationMs as number }),
          ...(typeof item.message !== "string" ? {} : { message: item.message.slice(0, 2048) }),
          labels: { suite: ["External adapter demo"] },
          steps: [],
          attachments: [],
        });
      }
    }
    return {
      id: "company-report-import",
      sourceFormat: "company-example-v1",
      tests,
    };
  },
};
