import type { TestStatus } from "./report.ts";
import { safeReportPath } from "./safe-path.ts";

export class InvalidTestReportError extends Error {
  constructor(detail: string) {
    super(`Invalid converted report: ${detail}`);
    this.name = "InvalidTestReportError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new InvalidTestReportError(`${field} must be a nonempty string`);
  }
}

function optionalText(value: unknown, field: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw new InvalidTestReportError(`${field} must be a string when supplied`);
  }
}

function optionalMilliseconds(value: unknown, field: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    throw new InvalidTestReportError(`${field} must be a finite nonnegative number`);
  }
}

function status(value: unknown): value is TestStatus {
  return (
    value === "passed" ||
    value === "failed" ||
    value === "broken" ||
    value === "skipped" ||
    value === "unknown"
  );
}

function checkAttachments(value: unknown, location: string): void {
  if (!Array.isArray(value)) {
    throw new InvalidTestReportError(`${location} attachments must be an array`);
  }
  for (const attachment of value) {
    if (!record(attachment)) {
      throw new InvalidTestReportError(`${location} attachment must be an object`);
    }
    requiredText(attachment.name, `${location} attachment name`);
    requiredText(attachment.sourcePath, `${location} attachment sourcePath`);
    optionalText(attachment.mimeType, `${location} attachment mimeType`);
    try {
      safeReportPath(attachment.sourcePath as string);
    } catch {
      throw new InvalidTestReportError(`${location} attachment path is unsafe`);
    }
  }
}

function checkSteps(
  steps: unknown,
  location: string,
  depth: number,
  budget: { count: number },
): void {
  if (!Array.isArray(steps)) {
    throw new InvalidTestReportError(`${location} steps must be an array`);
  }
  if (depth > 32) {
    throw new InvalidTestReportError("step nesting exceeds 32 levels");
  }
  for (const step of steps) {
    budget.count += 1;
    if (budget.count > 10_000) {
      throw new InvalidTestReportError("more than 10,000 steps in one test");
    }
    if (!record(step)) {
      throw new InvalidTestReportError(`${location} step must be an object`);
    }
    requiredText(step.name, `${location} step name`);
    if (!status(step.status)) {
      throw new InvalidTestReportError(`${location} step has invalid status`);
    }
    optionalMilliseconds(step.durationMs, `${location} step durationMs`);
    checkAttachments(step.attachments, location);
    checkSteps(step.steps, location, depth + 1, budget);
  }
}

/** Fail closed before browser UI adaptation; user-installed converters are trusted build code. */
export function validateTestReport(value: unknown): void {
  if (!record(value)) {
    throw new InvalidTestReportError("expected an object");
  }
  requiredText(value.id, "id");
  requiredText(value.sourceFormat, "sourceFormat");
  optionalText(value.name, "name");
  optionalText(value.generatedAt, "generatedAt");
  if (!Array.isArray(value.tests) || value.tests.length > 2_000) {
    throw new InvalidTestReportError("tests must be an array of at most 2,000 items");
  }
  const ids = new Set<string>();
  for (const test of value.tests) {
    if (!record(test)) {
      throw new InvalidTestReportError("test must be an object");
    }
    requiredText(test.id, "test id");
    requiredText(test.name, "test name");
    if (ids.has(test.id as string)) {
      throw new InvalidTestReportError(`duplicate test id: ${test.id}`);
    }
    ids.add(test.id as string);
    if (!status(test.status)) {
      throw new InvalidTestReportError(`test ${test.id} has invalid status`);
    }
    for (const key of ["historyId", "fullName", "message"] as const) {
      optionalText(test[key], `${test.id} ${key}`);
    }
    for (const key of ["durationMs", "startMs", "stopMs"] as const) {
      optionalMilliseconds(test[key], `${test.id} ${key}`);
    }
    if (!record(test.labels)) {
      throw new InvalidTestReportError(`test ${test.id} labels must be an object`);
    }
    for (const [name, values] of Object.entries(test.labels)) {
      if (!name || !Array.isArray(values) || !values.every((item) => typeof item === "string")) {
        throw new InvalidTestReportError(`test ${test.id} has invalid label ${name}`);
      }
    }
    checkAttachments(test.attachments, `test ${test.id}`);
    checkSteps(test.steps, `test ${test.id}`, 0, { count: 0 });
  }
}
