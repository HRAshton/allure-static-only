import { bindBrowserImportEvents } from "./browser-import.mjs";

const MAX_FILES = 2_000;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_BYTES = 64 * 1024 * 1024;

function assertNotCancelled(signal) {
  if (signal?.aborted) {
    throw new Error("Import cancelled.");
  }
}

/** Isolate generated report paths, rejecting traversal and absolute paths. */
export function normalizedGeneratedPath(filePath) {
  if (
    /^(?:[\\/]|[a-zA-Z]:[\\/])/.test(filePath) ||
    [...filePath].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  ) {
    return undefined;
  }
  const parts = filePath.replaceAll("\\", "/").split("/");
  if (parts.includes("..") || parts.includes(".")) {
    return undefined;
  }
  const root = parts.findIndex((part) => part === "data" || part === "widgets");
  if (root < 0 || root === parts.length - 1 || parts.slice(root).some((part) => !part)) {
    return undefined;
  }
  return parts.slice(root).join("/");
}

export function bytesToBase64(bytes) {
  let raw = "";
  for (let offset = 0; offset < bytes.length; offset += 16_384) {
    raw += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
  }
  return btoa(raw);
}

/** M2 imports generated Awesome data; raw allure-results conversion belongs to M3. */
export async function readGeneratedAllure(files, options = {}) {
  const { signal, onProgress } = options;
  assertNotCancelled(signal);
  if (files.length > MAX_FILES) {
    throw new Error("Too many files in the report directory.");
  }

  const accepted = [];
  const seen = new Set();
  let totalBytes = 0;
  for (const file of files) {
    const key = normalizedGeneratedPath(file.webkitRelativePath || file.name);
    if (!key) {
      continue;
    }
    if (seen.has(key)) {
      throw new Error(`Duplicate generated report path: ${key}`);
    }
    seen.add(key);
    if (!Number.isSafeInteger(file.size) || file.size > MAX_FILE_BYTES) {
      throw new Error(`File exceeds the 32 MiB limit: ${key}`);
    }
    totalBytes += file.size;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_BYTES) {
      throw new Error("Generated report exceeds the 64 MiB import limit.");
    }
    accepted.push({ file, key });
  }
  if (!seen.has("widgets/statistic.json")) {
    throw new Error("Expected widgets/statistic.json from a generated Allure Awesome report.");
  }

  const result = Object.create(null);
  let processedBytes = 0;
  for (const { file, key } of accepted) {
    assertNotCancelled(signal);
    const bytes = new Uint8Array(await file.arrayBuffer());
    assertNotCancelled(signal);
    result[key] = bytesToBase64(bytes);
    processedBytes += bytes.byteLength;
    onProgress?.({ processedBytes, totalBytes });
  }
  return result;
}

async function loadConverterModules() {
  const [registry, importer, adapter, zip] = await Promise.all([
    import("./app/config/converters.js"),
    import("./app/runtime/import-browser-report.js"),
    import("./app/allure-adapter/awesome-data.js"),
    import("./app/runtime/unzip-report.js"),
  ]);
  return {
    converterRegistry: registry.default,
    importBrowserReport: importer.importBrowserReport,
    awesomeReportData: adapter.awesomeReportData,
    unzipReportFiles: zip.unzipReportFiles,
  };
}

/** Converts a registered format to upstream Awesome data without server-side processing. */
export async function readConvertedReport(files, options = {}, loadModules = loadConverterModules) {
  const { signal, onProgress } = options;
  assertNotCancelled(signal);
  const { converterRegistry, importBrowserReport, awesomeReportData, unzipReportFiles } =
    await loadModules();
  const sourceFiles =
    files.length === 1 && /\.zip$/i.test(files[0].name)
      ? await unzipReportFiles(files[0], signal)
      : files;
  const report = await importBrowserReport(sourceFiles, converterRegistry.converters, { signal });
  assertNotCancelled(signal);
  const { documents, binaries } = awesomeReportData(report);
  const mapped = Object.create(null);
  for (const [path, value] of Object.entries(documents)) {
    const encoded = new TextEncoder().encode(JSON.stringify(value));
    mapped[path] = bytesToBase64(encoded);
  }

  const seen = new Set();
  let totalBytes = 0;
  for (const { targetPath, sourcePath } of binaries) {
    const matching = sourceFiles.filter((file) => {
      const fullPath = file.webkitRelativePath || file.name;
      return fullPath === sourcePath || fullPath.endsWith(`/${sourcePath}`);
    });
    if (matching.length !== 1) {
      throw new Error(`Missing or ambiguous attachment: ${sourcePath}`);
    }
    const file = matching[0];
    if (file.size > 32 * 1024 * 1024) {
      throw new Error(`Oversize attachment: ${sourcePath}`);
    }
    totalBytes += file.size;
    if (totalBytes > 64 * 1024 * 1024 || seen.has(targetPath)) {
      throw new Error("Attachment limit or duplicate path exceeded.");
    }
    seen.add(targetPath);
    assertNotCancelled(signal);
    mapped[targetPath] = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    assertNotCancelled(signal);
    onProgress?.({ processedBytes: totalBytes, totalBytes });
  }
  return mapped;
}

function initializeImporter() {
  const directoryInput = document.getElementById("allure-input");
  const filesInput = document.getElementById("allure-files-input");
  const overlay = document.getElementById("allure-importer");
  const dropTarget = document.getElementById("allure-drop-target");
  const errorElement = document.getElementById("allure-import-error");
  const progressElement = document.getElementById("allure-import-progress");
  const cancelButton = document.getElementById("allure-cancel");
  if (
    !(directoryInput instanceof HTMLInputElement) ||
    !(filesInput instanceof HTMLInputElement) ||
    !(cancelButton instanceof HTMLButtonElement) ||
    !overlay ||
    !dropTarget ||
    !errorElement ||
    !progressElement
  ) {
    throw new Error("Static report importer markup is missing.");
  }
  const inputs = [directoryInput, filesInput];
  let controller;
  const setBusy = (busy) => {
    for (const input of inputs) {
      input.disabled = busy;
    }
    cancelButton.hidden = !busy;
  };
  const onFiles = async (files) => {
    if (controller) {
      throw new Error("An import is already in progress.");
    }
    controller = new AbortController();
    errorElement.textContent = "";
    progressElement.textContent = "Loading report locally";
    setBusy(true);
    try {
      const isGenerated = files.some(
        (file) =>
          normalizedGeneratedPath(file.webkitRelativePath || file.name) ===
          "widgets/statistic.json",
      );
      const importer = isGenerated ? readGeneratedAllure : readConvertedReport;
      const data = await importer(files, {
        signal: controller.signal,
        onProgress({ processedBytes, totalBytes }) {
          progressElement.textContent = `Loaded ${processedBytes} / ${totalBytes} bytes locally`;
        },
      });
      assertNotCancelled(controller.signal);
      window.allureReportData = data;
      window.allureReportDataReady = true;
      overlay.hidden = true;
    } catch (error) {
      errorElement.textContent = error instanceof Error ? error.message : "Import failed.";
    } finally {
      controller = undefined;
      setBusy(false);
    }
  };
  cancelButton.addEventListener("click", () => controller?.abort());
  bindBrowserImportEvents({
    dropTarget,
    inputs,
    onFiles,
    onError(error) {
      errorElement.textContent = error instanceof Error ? error.message : "Import failed.";
    },
  });
  setBusy(false);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeImporter, { once: true });
  } else {
    initializeImporter();
  }
}
