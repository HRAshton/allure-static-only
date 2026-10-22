import type { TestReport } from "../domain/report.ts";

/** Browser file reads are adapted to this portable, framework-neutral port. */
export interface ReportInput {
  readonly path: string;
  readonly byteLength: number;
  readonly mimeType?: string;
  read(): Promise<Uint8Array>;
}

/** Stable API for bundled converters; arbitrary user-supplied JS is not supported. */
export interface ReportConverter {
  readonly id: string;
  readonly apiVersion: 1;
  readonly extensions: readonly string[];
  detect(inputs: readonly ReportInput[]): Promise<number>;
  convert(inputs: readonly ReportInput[], cancellation: Cancellation): Promise<TestReport>;
}

export interface Cancellation {
  readonly isCancelled: () => boolean;
}
