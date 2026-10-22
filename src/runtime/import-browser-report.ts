import type { Cancellation, ReportConverter } from "../converters/contract.ts";
import type { TestReport } from "../domain/report.ts";
import {
  type BrowserInputLimits,
  browserReportInputs,
  ImportCancelledError,
} from "./browser-files.ts";
import { chooseConverter } from "./choose-converter.ts";

/** Complete import transaction, with cancellation checks at every async boundary. */
export async function importBrowserReport(
  files: readonly File[],
  converters: readonly ReportConverter[],
  options: { readonly signal?: AbortSignal; readonly limits?: BrowserInputLimits } = {},
): Promise<TestReport> {
  const { signal } = options;
  if (signal?.aborted) {
    throw new ImportCancelledError();
  }

  const inputs = browserReportInputs(files, signal, options.limits);
  const converter = await chooseConverter(converters, inputs);
  if (signal?.aborted) {
    throw new ImportCancelledError();
  }

  const cancellation: Cancellation = { isCancelled: () => signal?.aborted ?? false };
  const report = await converter.convert(inputs, cancellation);
  if (signal?.aborted) {
    throw new ImportCancelledError();
  }
  return report;
}
