const MAX_FILES = 2_000;
const MAX_BYTES = 64 * 1024 * 1024;

/** Isolate only generated Allure data paths, never accept traversal or absolute paths. */
export function normalizedGeneratedPath(filePath) {
  if (/^(?:[\\/]|[a-zA-Z]:[\\/])/.test(filePath) || /[\u0000-\u001f]/.test(filePath)) {
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

/** M1 proof only: accepts already-generated Allure Awesome output, NOT raw allure-results. */
export async function readGeneratedAllure(files) {
  if (files.length > MAX_FILES) {
    throw new Error("Too many files in the report directory.");
  }

  const result = Object.create(null);
  let totalBytes = 0;
  for (const file of files) {
    const key = normalizedGeneratedPath(file.webkitRelativePath || file.name);
    if (!key) {
      continue;
    }

    totalBytes += file.size;
    if (totalBytes > MAX_BYTES) {
      throw new Error("Generated report exceeds the 64 MiB M1 import limit.");
    }
    if (Object.hasOwn(result, key)) {
      throw new Error(`Duplicate generated report path: ${key}`);
    }
    result[key] = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  }

  if (!Object.hasOwn(result, "widgets/statistic.json")) {
    throw new Error("Expected widgets/statistic.json from a generated Allure Awesome report.");
  }

  return result;
}

function initializeImporter() {
  const input = document.getElementById("allure-input");
  const overlay = document.getElementById("allure-importer");
  const errorElement = document.getElementById("allure-import-error");

  if (!(input instanceof HTMLInputElement) || !overlay || !errorElement) {
    throw new Error("Static report importer markup is missing.");
  }

  input.addEventListener("change", async () => {
    errorElement.textContent = "";
    input.disabled = true;
    try {
      const data = await readGeneratedAllure(Array.from(input.files ?? []));
      // This existing interface is read by @allurereport/web-commons/src/data.ts.
      window.allureReportData = data;
      window.allureReportDataReady = true;
      overlay.hidden = true;
    } catch (error) {
      errorElement.textContent = error instanceof Error ? error.message : "Import failed.";
    } finally {
      input.disabled = false;
    }
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeImporter, { once: true });
  } else {
    initializeImporter();
  }
}
