/** Framework-independent data, with unknown values preserved explicitly. */
export type TestStatus = "passed" | "failed" | "broken" | "skipped" | "unknown";

export interface ReportAttachment {
  readonly name: string;
  readonly sourcePath: string;
  readonly mimeType?: string;
}

export interface ReportStep {
  readonly name: string;
  readonly status: TestStatus;
  readonly durationMs?: number;
  readonly steps: readonly ReportStep[];
  readonly attachments: readonly ReportAttachment[];
}

export interface TestCase {
  readonly id: string;
  readonly name: string;
  readonly historyId?: string;
  readonly startMs?: number;
  readonly stopMs?: number;
  readonly status: TestStatus;
  readonly durationMs?: number;
  readonly fullName?: string;
  readonly message?: string;
  readonly labels: Readonly<Record<string, readonly string[]>>;
  readonly steps: readonly ReportStep[];
  readonly attachments: readonly ReportAttachment[];
}

export interface TestReport {
  readonly id: string;
  readonly tests: readonly TestCase[];
  readonly sourceFormat: string;
  readonly name?: string;
  readonly generatedAt?: string;
}
