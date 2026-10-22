/** Public, build-time converter API v1. Internal Awesome widget types are not part of this contract. */
import type { ReportConverter } from "../converters/contract.ts";

export type {
  Cancellation,
  ReportConverter,
  ReportInput,
} from "../converters/contract.ts";
export type {
  ReportAttachment,
  ReportStep,
  TestCase,
  TestReport,
  TestStatus,
} from "../domain/report.ts";

export { InvalidTestReportError, validateTestReport } from "../domain/validate-report.ts";

export const CONVERTER_API_VERSION = 1 as const;

export interface ConverterRegistry {
  readonly apiVersion: 1;
  readonly converters: readonly ReportConverter[];
}

/**
 * Validate a build-approved converter registry and freeze its membership.
 * This does NOT sandbox a converter: trusted code is bundled at image build time.
 */
export function defineConverters(config: ConverterRegistry): ConverterRegistry {
  if (
    config?.apiVersion !== 1 ||
    !Array.isArray(config.converters) ||
    config.converters.length === 0
  ) {
    throw new Error("Invalid converter registry: expected apiVersion 1 and a converters array.");
  }
  const seen = new Set<string>();
  for (const converter of config.converters) {
    if (
      converter?.apiVersion !== 1 ||
      typeof converter.id !== "string" ||
      !/^[a-z0-9][a-z0-9._-]*$/.test(converter.id) ||
      typeof converter.detect !== "function" ||
      typeof converter.convert !== "function" ||
      !Array.isArray(converter.extensions) ||
      converter.extensions.length === 0 ||
      !converter.extensions.every(
        (extension: unknown) => typeof extension === "string" && extension.length > 0,
      )
    ) {
      throw new Error(
        "Invalid converter registration: expected API v1, ID, extensions and methods.",
      );
    }
    if (seen.has(converter.id)) {
      throw new Error(`Duplicate converter registration: ${converter.id}`);
    }
    seen.add(converter.id);
  }
  return Object.freeze({
    apiVersion: 1 as const,
    converters: Object.freeze([...config.converters]),
  });
}
