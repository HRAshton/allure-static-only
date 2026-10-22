import type {
  ReportAttachment,
  ReportStep,
  TestCase,
  TestReport,
  TestStatus,
} from "../domain/report.ts";
import { safeReportPath } from "../domain/safe-path.ts";
import type { Cancellation, ReportConverter, ReportInput } from "./contract.ts";

const MAX_RESULTS = 2_000;
const MAX_STEPS = 10_000;
const MAX_DEPTH = 32;

export class MalformedAllureResultsError extends Error {
  constructor(path: string, reason: string) {
    super(`Invalid Allure result ${path}: ${reason}`);
    this.name = "MalformedAllureResultsError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStatus(raw: unknown): TestStatus {
  return raw === "passed" ||
    raw === "failed" ||
    raw === "broken" ||
    raw === "skipped" ||
    raw === "unknown"
    ? raw
    : "unknown";
}

function readDuration(obj: Record<string, unknown>): number | undefined {
  const { start, stop } = obj;
  if (
    typeof start === "number" &&
    typeof stop === "number" &&
    Number.isFinite(start) &&
    Number.isFinite(stop) &&
    stop >= start &&
    Number.isFinite(stop - start)
  ) {
    return stop - start;
  }
  return undefined;
}

function optionalString(raw: unknown): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

function readAttachments(raw: unknown, filename: string): readonly ReportAttachment[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new MalformedAllureResultsError(filename, "attachments must be an array");
  }
  return raw.map((value: unknown): ReportAttachment => {
    if (!isRecord(value) || typeof value.name !== "string" || typeof value.source !== "string") {
      throw new MalformedAllureResultsError(filename, "invalid attachment");
    }
    let sourcePath: string;
    try {
      sourcePath = safeReportPath(value.source);
    } catch {
      throw new MalformedAllureResultsError(filename, "unsafe attachment path");
    }
    return {
      name: value.name,
      sourcePath,
      ...(typeof value.type === "string" ? { mimeType: value.type } : {}),
    };
  });
}

function readSteps(
  raw: unknown,
  filename: string,
  depth: number,
  budget: { count: number },
): readonly ReportStep[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new MalformedAllureResultsError(filename, "steps must be an array");
  }
  if (depth > MAX_DEPTH)
    throw new MalformedAllureResultsError(filename, "steps exceed nesting limit");

  return raw.map((value: unknown): ReportStep => {
    budget.count += 1;
    if (budget.count > MAX_STEPS) {
      throw new MalformedAllureResultsError(filename, "too many steps");
    }
    if (!isRecord(value) || typeof value.name !== "string") {
      throw new MalformedAllureResultsError(filename, "invalid step");
    }
    const durationMs = readDuration(value);
    return {
      name: value.name,
      status: readStatus(value.status),
      ...(durationMs !== undefined ? { durationMs } : {}),
      steps: readSteps(value.steps, filename, depth + 1, budget),
      attachments: readAttachments(value.attachments, filename),
    };
  });
}

function readLabels(raw: unknown, filename: string): Readonly<Record<string, readonly string[]>> {
  if (raw === undefined) return {};
  if (!Array.isArray(raw)) {
    throw new MalformedAllureResultsError(filename, "labels must be an array");
  }
  const labels: Record<string, string[]> = Object.create(null);
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.name !== "string" || typeof entry.value !== "string") {
      throw new MalformedAllureResultsError(filename, "invalid label");
    }
    const group = labels[entry.name] ?? [];
    group.push(entry.value);
    labels[entry.name] = group;
  }
  return labels;
}

function convertTest(value: unknown, filename: string): TestCase {
  if (
    !isRecord(value) ||
    typeof value.uuid !== "string" ||
    !value.uuid.trim() ||
    typeof value.name !== "string" ||
    !value.name.trim()
  ) {
    throw new MalformedAllureResultsError(filename, "expected nonempty uuid and name");
  }

  const durationMs = readDuration(value);
  const statusDetails = isRecord(value.statusDetails) ? value.statusDetails : {};
  const fullName = optionalString(value.fullName);
  const message = optionalString(statusDetails.message);
  const historyId = optionalString(value.historyId);
  const startMs =
    typeof value.start === "number" && Number.isFinite(value.start) && value.start >= 0
      ? value.start
      : undefined;
  const stopMs =
    typeof value.stop === "number" && Number.isFinite(value.stop) && value.stop >= 0
      ? value.stop
      : undefined;
  return {
    id: value.uuid,
    name: value.name,
    ...(historyId ? { historyId } : {}),
    ...(startMs === undefined ? {} : { startMs }),
    ...(stopMs === undefined ? {} : { stopMs }),
    status: readStatus(value.status),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(fullName !== undefined ? { fullName } : {}),
    ...(message !== undefined ? { message } : {}),
    labels: readLabels(value.labels, filename),
    steps: readSteps(value.steps, filename, 0, { count: 0 }),
    attachments: readAttachments(value.attachments, filename),
  };
}

const resultPattern = /(?:^|\/)\S+-result\.json$/i;

export const allureResultsConverter: ReportConverter = {
  id: "allure-results",
  apiVersion: 1,
  extensions: ["-result.json"],
  async detect(inputs: readonly ReportInput[]): Promise<number> {
    return inputs.some(({ path }) => resultPattern.test(path)) ? 90 : 0;
  },
  async convert(inputs: readonly ReportInput[], cancellation: Cancellation): Promise<TestReport> {
    const matching = inputs.filter(({ path }) => resultPattern.test(path));
    if (!matching.length) throw new Error("No Allure result files found.");
    if (matching.length > MAX_RESULTS) throw new Error("Too many Allure results.");

    const tests: TestCase[] = [];
    const ids = new Set<string>();
    for (const input of [...matching].sort((a, b) => a.path.localeCompare(b.path))) {
      if (cancellation.isCancelled()) throw new Error("Allure conversion cancelled.");
      let value: unknown;
      try {
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await input.read()));
      } catch {
        throw new MalformedAllureResultsError(input.path, "invalid UTF-8 or JSON");
      }
      if (cancellation.isCancelled()) throw new Error("Allure conversion cancelled.");
      const result = convertTest(value, input.path);
      if (ids.has(result.id)) {
        throw new MalformedAllureResultsError(input.path, "duplicate UUID");
      }
      ids.add(result.id);
      tests.push(result);
    }
    return { id: "imported-allure-results", sourceFormat: "allure-results", tests };
  },
};
