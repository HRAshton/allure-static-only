import type {
  ReportAttachment,
  ReportStep,
  TestCase,
  TestReport,
  TestStatus,
} from "../domain/report.ts";
import { safeReportPath } from "../domain/safe-path.ts";
import type { Cancellation, ReportConverter, ReportInput } from "./contract.ts";

const MAX_CTRF_BYTES = 8 * 1024 * 1024;
const MAX_TEST_CASES = 2_000;
const MAX_STEPS = 10_000;
const MAX_RETRIES = 100;
const MAX_MESSAGE = 16_384;
const ctrfFile = /\.json$/i;
const semver = /^\d+\.\d+\.\d+$/;

export class InvalidCTRFError extends Error {
  constructor(file: string, reason: string) {
    super(`Invalid CTRF report ${file}: ${reason}`);
    this.name = "InvalidCTRFError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function string(value: unknown, file: string, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new InvalidCTRFError(file, `${field} must be a nonempty string`);
  }
  return value;
}

function optionalString(value: unknown, file: string, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new InvalidCTRFError(file, `${field} must be a string`);
  return value;
}

function nonnegativeInteger(value: unknown, file: string, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new InvalidCTRFError(file, `${field} must be a nonnegative integer`);
  }
  return value as number;
}

function optionalMilliseconds(value: unknown, file: string, field: string): number | undefined {
  if (value === undefined) return undefined;
  return nonnegativeInteger(value, file, field);
}

function status(value: unknown, file: string): TestStatus {
  switch (value) {
    case "passed":
    case "failed":
    case "skipped":
      return value;
    case "pending":
      return "skipped";
    case "other":
      return "unknown";
    default:
      throw new InvalidCTRFError(file, "unknown test status");
  }
}

function attachments(value: unknown, file: string): ReportAttachment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new InvalidCTRFError(file, "attachments must be an array");
  return value.map((entry: unknown): ReportAttachment => {
    if (!record(entry)) throw new InvalidCTRFError(file, "attachment must be an object");
    const name = string(entry.name, file, "attachment.name");
    const source = string(entry.path, file, "attachment.path");
    let sourcePath: string;
    try {
      sourcePath = safeReportPath(source);
    } catch {
      throw new InvalidCTRFError(file, "unsafe attachment path");
    }
    const mimeType = optionalString(entry.contentType, file, "attachment.contentType");
    return { name, sourcePath, ...(mimeType === undefined ? {} : { mimeType }) };
  });
}

function steps(value: unknown, file: string): ReportStep[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_STEPS) {
    throw new InvalidCTRFError(file, "steps must be an array of at most 10000 items");
  }
  return value.map((entry: unknown): ReportStep => {
    if (!record(entry)) throw new InvalidCTRFError(file, "step must be an object");
    return {
      name: string(entry.name, file, "step.name"),
      status: status(entry.status, file),
      steps: [],
      attachments: [],
    };
  });
}

function labels(test: Record<string, unknown>, file: string): Record<string, string[]> {
  const result: Record<string, string[]> = Object.create(null);
  const suite = test.suite;
  if (suite !== undefined) {
    if (!Array.isArray(suite) || !suite.every((part) => typeof part === "string")) {
      throw new InvalidCTRFError(file, "suite must be an array of strings");
    }
    if (suite.length) {
      result.suite = [suite.at(-1) as string];
      if (suite.length > 1) result.parentSuite = [suite.slice(0, -1).join(" / ")];
    }
  }
  const tags = test.tags;
  if (tags !== undefined) {
    if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) {
      throw new InvalidCTRFError(file, "tags must be an array of strings");
    }
    result.tag = tags;
  }
  const browser = optionalString(test.browser, file, "test.browser");
  if (browser) result.browser = [browser];
  const filePath = optionalString(test.filePath, file, "test.filePath");
  if (filePath) result.package = [filePath];
  return result;
}

function summary(value: unknown, file: string): void {
  if (!record(value)) throw new InvalidCTRFError(file, "results.summary is required");
  for (const key of ["tests", "passed", "failed", "skipped", "pending", "other", "start", "stop"]) {
    nonnegativeInteger(value[key], file, `summary.${key}`);
  }
}

function attempt(
  entry: Record<string, unknown>,
  file: string,
  name: string,
  id: string,
  historyId: string,
  testLabels: Readonly<Record<string, readonly string[]>>,
  order: number,
): TestCase {
  return {
    id: `${id}:attempt-${order}`,
    historyId,
    name,
    status: status(entry.status, file),
    durationMs: nonnegativeInteger(entry.duration, file, "retry.duration"),
    ...(optionalMilliseconds(entry.start, file, "retry.start") === undefined
      ? {}
      : { startMs: nonnegativeInteger(entry.start, file, "retry.start") }),
    ...(optionalMilliseconds(entry.stop, file, "retry.stop") === undefined
      ? {}
      : { stopMs: nonnegativeInteger(entry.stop, file, "retry.stop") }),
    ...(optionalString(entry.message, file, "retry.message") === undefined
      ? {}
      : { message: (entry.message as string).slice(0, MAX_MESSAGE) }),
    labels: testLabels,
    steps: [],
    attachments: attachments(entry.attachments, file),
  };
}

function convertTest(source: unknown, file: string, index: number, output: TestCase[]): void {
  if (!record(source)) throw new InvalidCTRFError(file, "test must be an object");
  const name = string(source.name, file, "test.name");
  const id = `${file}#${index}`;
  const history = optionalString(source.testId, file, "test.testId");
  const previous = source.retryAttempts;
  const retryCount =
    source.retries === undefined ? 0 : nonnegativeInteger(source.retries, file, "test.retries");
  if (retryCount > MAX_RETRIES) throw new InvalidCTRFError(file, "too many retries");
  if (
    (previous !== undefined && (!Array.isArray(previous) || previous.length !== retryCount)) ||
    (retryCount > 0 && previous === undefined) ||
    (retryCount === 0 && previous !== undefined)
  ) {
    throw new InvalidCTRFError(file, "retryAttempts must match retries count");
  }
  const historyId = retryCount > 0 ? `${file}:${history ?? String(index)}` : undefined;
  const testLabels = labels(source, file);
  if (Array.isArray(previous)) {
    for (const [attemptIndex, prev] of previous.entries()) {
      if (!record(prev) || prev.attempt !== attemptIndex + 1) {
        throw new InvalidCTRFError(file, "retry attempts must have ordered attempt numbers");
      }
      output.push(attempt(prev, file, name, id, historyId as string, testLabels, attemptIndex + 1));
    }
  }
  const start = optionalMilliseconds(source.start, file, "test.start");
  const stop = optionalMilliseconds(source.stop, file, "test.stop");
  const message = optionalString(source.message, file, "test.message");
  const fullName = optionalString(source.testId, file, "test.testId");
  output.push({
    id,
    name,
    ...(historyId === undefined ? {} : { historyId }),
    ...(fullName === undefined ? {} : { fullName }),
    status: status(source.status, file),
    durationMs: nonnegativeInteger(source.duration, file, "test.duration"),
    ...(start === undefined ? {} : { startMs: start }),
    ...(stop === undefined ? {} : { stopMs: stop }),
    ...(message ? { message: message.slice(0, MAX_MESSAGE) } : {}),
    labels: testLabels,
    steps: steps(source.steps, file),
    attachments: attachments(source.attachments, file),
  });
}

export const ctrfJsonConverter: ReportConverter = {
  id: "ctrf-json",
  apiVersion: 1,
  extensions: [".json"],
  async detect(inputs: readonly ReportInput[]): Promise<number> {
    for (const input of inputs) {
      if (!ctrfFile.test(input.path) || input.byteLength > MAX_CTRF_BYTES) continue;
      try {
        const raw: unknown = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(await input.read()),
        );
        if (record(raw) && raw.reportFormat === "CTRF") return 99;
      } catch {
        // Another JSON format or invalid input; return no match rather than guessing.
      }
    }
    return 0;
  },
  async convert(inputs: readonly ReportInput[], cancellation: Cancellation): Promise<TestReport> {
    const files = [...inputs.filter(({ path }) => ctrfFile.test(path))].sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    const output: TestCase[] = [];
    let sourceName: string | undefined;
    let generatedAt: string | undefined;
    let count = 0;
    for (const input of files) {
      if (cancellation.isCancelled()) throw new Error("CTRF conversion cancelled.");
      if (input.byteLength > MAX_CTRF_BYTES) {
        throw new InvalidCTRFError(input.path, "JSON exceeds 8 MiB limit");
      }
      let document: unknown;
      try {
        document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await input.read()));
      } catch {
        throw new InvalidCTRFError(input.path, "invalid UTF-8 or JSON");
      }
      if (!record(document) || document.reportFormat !== "CTRF") continue;
      if (typeof document.specVersion !== "string" || !semver.test(document.specVersion)) {
        throw new InvalidCTRFError(input.path, "expected CTRF specVersion x.y.z");
      }
      if (!record(document.results)) {
        throw new InvalidCTRFError(input.path, "results must be an object");
      }
      const result = document.results;
      if (!record(result.tool)) throw new InvalidCTRFError(input.path, "missing results.tool");
      const tool = string(result.tool.name, input.path, "tool.name");
      summary(result.summary, input.path);
      if (!Array.isArray(result.tests)) {
        throw new InvalidCTRFError(input.path, "results.tests must be an array");
      }
      count += result.tests.length;
      if (count > MAX_TEST_CASES) throw new InvalidCTRFError(input.path, "too many tests");
      sourceName ??= tool;
      generatedAt ??= optionalString(document.timestamp, input.path, "timestamp");
      for (const [index, entry] of result.tests.entries()) {
        if (cancellation.isCancelled()) throw new Error("CTRF conversion cancelled.");
        convertTest(entry, input.path, index, output);
        if (output.length > MAX_TEST_CASES) {
          throw new InvalidCTRFError(input.path, "too many test attempts");
        }
      }
    }
    if (sourceName === undefined) throw new Error("No CTRF reports found.");
    return {
      id: "imported-ctrf-json",
      sourceFormat: "ctrf-json",
      name: sourceName,
      ...(generatedAt === undefined ? {} : { generatedAt }),
      tests: output,
    };
  },
};
