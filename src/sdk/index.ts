import type { TestReport } from "../domain/report.ts";

export type {
  ReportAttachment,
  ReportStep,
  TestCase,
  TestReport,
  TestStatus,
} from "../domain/report.ts";

/** Browser-local file handle; no network, filesystem path, or provider-specific types. */
export interface ReportInput {
  readonly path: string;
  readonly byteLength: number;
  readonly mimeType?: string;
  read(): Promise<Uint8Array>;
}

/** Check during detection, parsing, and any long-running iteration. */
export interface Cancellation {
  readonly isCancelled: () => boolean;
}

/**
 * Version 1 converter API. Converters transform untrusted source files into a
 * framework-independent TestReport; Allure widget encoding is handled elsewhere.
 */
export interface ReportConverter {
  readonly id: string;
  readonly apiVersion: 1;
  readonly extensions: readonly string[];
  detect(inputs: readonly ReportInput[]): Promise<number>;
  convert(inputs: readonly ReportInput[], cancellation: Cancellation): Promise<TestReport>;
}

export const CONVERTER_API_VERSION = 1 as const;

export interface ConverterConfiguration {
  readonly converters: readonly ReportConverter[];
}

/** Validates and freezes the build-approved converter registry. */
export function defineConverters(config: ConverterConfiguration): Readonly<ConverterConfiguration> {
  if (!config || !Array.isArray(config.converters) || config.converters.length === 0) {
    throw new Error("Converter registry must contain at least one converter.");
  }

  const ids = new Set<string>();
  for (const converter of config.converters) {
    if (
      !converter ||
      typeof converter.id !== "string" ||
      !/^[a-z][a-z0-9]*(?:[-._][a-z0-9]+)*$/.test(converter.id)
    ) {
      throw new Error("Converter IDs must be lowercase, nonempty and stable.");
    }
    if (converter.apiVersion !== CONVERTER_API_VERSION) {
      throw new Error(`Converter ${converter.id} has an unsupported API version.`);
    }
    if (ids.has(converter.id)) {
      throw new Error(`Duplicate converter ID: ${converter.id}`);
    }
    ids.add(converter.id);

    if (
      !Array.isArray(converter.extensions) ||
      converter.extensions.length === 0 ||
      converter.extensions.some(
        (ext: unknown) =>
          typeof ext !== "string" || !/^(?:\.[a-z0-9]+|-[a-z0-9-]+(?:\.[a-z0-9]+)+)$/.test(ext),
      )
    ) {
      throw new Error(`Converter ${converter.id} must declare lowercase filename suffixes.`);
    }
    if (typeof converter.detect !== "function" || typeof converter.convert !== "function") {
      throw new Error(`Converter ${converter.id} is missing detect() or convert().`);
    }
  }

  return Object.freeze({ converters: Object.freeze([...config.converters]) });
}
