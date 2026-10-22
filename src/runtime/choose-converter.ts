import type { ReportConverter, ReportInput } from "../converters/contract.ts";

export class UnsupportedReportError extends Error {
  constructor() {
    super("No converter recognizes the supplied report.");
    this.name = "UnsupportedReportError";
  }
}

export class AmbiguousReportError extends Error {
  readonly converterIds: readonly string[];

  constructor(converterIds: readonly string[]) {
    super(`Multiple converters matched equally: ${converterIds.join(", ")}`);
    this.name = "AmbiguousReportError";
    this.converterIds = converterIds;
  }
}

/** Match deterministically. Never guess on equally strong format matches. */
export async function chooseConverter(
  converters: readonly ReportConverter[],
  inputs: readonly ReportInput[],
): Promise<ReportConverter> {
  if (inputs.length === 0) {
    throw new UnsupportedReportError();
  }

  const detected = await Promise.all(
    converters.map(async (converter) => {
      if (converter.apiVersion !== 1 || !converter.id.trim()) {
        throw new Error("Invalid converter registration.");
      }

      const confidence = await converter.detect(inputs);
      if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
        throw new Error(`Converter ${converter.id} returned an invalid detection score.`);
      }

      return { converter, confidence };
    }),
  );

  const matches = detected
    .filter((item) => item.confidence > 0)
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        left.converter.id.localeCompare(right.converter.id),
    );
  const first = matches[0];

  if (!first) {
    throw new UnsupportedReportError();
  }

  const tied = matches.filter((item) => item.confidence === first.confidence);
  if (tied.length > 1) {
    throw new AmbiguousReportError(tied.map((item) => item.converter.id));
  }

  return first.converter;
}
