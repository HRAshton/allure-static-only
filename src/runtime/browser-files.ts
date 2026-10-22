import type { ReportInput } from "../converters/contract.ts";

export interface BrowserInputLimits {
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}

export const DEFAULT_INPUT_LIMITS: BrowserInputLimits = Object.freeze({
  maxFiles: 2_000,
  maxFileBytes: 32 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
});

export class InvalidBrowserInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBrowserInputError";
  }
}

export class ImportCancelledError extends Error {
  constructor() {
    super("Import cancelled.");
    this.name = "ImportCancelledError";
  }
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ImportCancelledError();
  }
}

export function normalizedFilePath(raw: string): string {
  if (
    !raw ||
    /^(?:[\\/]|[a-zA-Z]:[\\/])/.test(raw) ||
    [...raw].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  ) {
    throw new InvalidBrowserInputError(
      "Absolute, empty or control-character paths are not allowed.",
    );
  }

  const parts = raw.replaceAll("\\", "/").split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new InvalidBrowserInputError("Empty and traversal path segments are not allowed.");
  }

  return parts.join("/");
}

function validateLimits(limits: BrowserInputLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new InvalidBrowserInputError(`Invalid input limit ${name}.`);
    }
  }
}

/**
 * Adapts local browser Files to format-neutral input ports.
 * Does not call fetch(), persist contents or transmit any report bytes.
 */
export function browserReportInputs(
  files: readonly File[],
  signal?: AbortSignal,
  limits: BrowserInputLimits = DEFAULT_INPUT_LIMITS,
): readonly ReportInput[] {
  assertNotCancelled(signal);
  validateLimits(limits);
  if (files.length === 0) {
    throw new InvalidBrowserInputError("No report files selected.");
  }
  if (files.length > limits.maxFiles) {
    throw new InvalidBrowserInputError("Report exceeds the file count limit.");
  }

  const usedPaths = new Set<string>();
  let totalBytes = 0;
  return files.map((file) => {
    const path = normalizedFilePath(file.webkitRelativePath || file.name);
    if (usedPaths.has(path)) {
      throw new InvalidBrowserInputError(`Duplicate path: ${path}`);
    }
    usedPaths.add(path);

    if (!Number.isSafeInteger(file.size) || file.size > limits.maxFileBytes) {
      throw new InvalidBrowserInputError(`Report file exceeds the per-file size limit: ${path}`);
    }
    totalBytes += file.size;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > limits.maxTotalBytes) {
      throw new InvalidBrowserInputError("Report exceeds the total size limit.");
    }

    return {
      path,
      byteLength: file.size,
      ...(file.type ? { mimeType: file.type } : {}),
      async read(): Promise<Uint8Array> {
        assertNotCancelled(signal);
        const content = new Uint8Array(await file.arrayBuffer());
        assertNotCancelled(signal);
        return content;
      },
    };
  });
}
