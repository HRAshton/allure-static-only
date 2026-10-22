import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "src");
const dependencies = {
  domain: new Set(["domain"]),
  converters: new Set(["converters", "domain"]),
  runtime: new Set(["runtime", "converters", "domain"]),
  "allure-adapter": new Set(["allure-adapter", "runtime", "converters", "domain"]),
  shell: new Set(["shell", "allure-adapter", "runtime", "converters", "domain"]),
};

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(filename)));
    } else if (entry.isFile() && filename.endsWith(".ts")) {
      files.push(filename);
    }
  }
  return files;
}

const failures = [];
for (const filename of await collect(sourceRoot)) {
  const fromLayer = path.relative(sourceRoot, filename).split(path.sep)[0];
  const source = await readFile(filename, "utf8");
  const importPattern =
    /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^;\n]*?\sfrom\s+)?["']([^"']+)["']/g;

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier) continue;
    if (!specifier.startsWith(".")) {
      if (fromLayer === "domain") failures.push(`${filename}: domain cannot import packages`);
      continue;
    }

    const target = path.resolve(path.dirname(filename), specifier);
    const relativeTarget = path.relative(sourceRoot, target);
    const toLayer = relativeTarget.split(path.sep)[0];
    if (relativeTarget.startsWith("..") || !dependencies[fromLayer]?.has(toLayer)) {
      failures.push(`${filename}: forbidden dependency on ${specifier}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Architecture boundaries OK");
}
