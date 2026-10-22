import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyRelease } from "./release-assets.mjs";

/** Compare complete, individually validated static release outputs from separate builds. */
export async function compareReleaseTrees(first, second) {
  const [leftPath, rightPath] = await Promise.all([realpath(first), realpath(second)]);
  if (leftPath === rightPath) {
    throw new Error("Release comparison requires two independent output directories.");
  }
  await Promise.all([verifyRelease(leftPath), verifyRelease(rightPath)]);
  const [left, right] = await Promise.all([
    readFile(path.join(leftPath, "SHA256SUMS"), "utf8"),
    readFile(path.join(rightPath, "SHA256SUMS"), "utf8"),
  ]);
  if (left !== right) {
    const leftLines = left.split("\n");
    const rightLines = right.split("\n");
    const index = Array.from(
      { length: Math.max(leftLines.length, rightLines.length) },
      (_, position) => position,
    ).find((position) => leftLines[position] !== rightLines[position]);
    const position = index ?? 0;
    throw new Error(
      `Separate release builds are not byte-identical (entry ${position}).\n` +
        `first: ${leftLines[position] ?? "<missing>"}\nsecond: ${rightLines[position] ?? "<missing>"}`,
    );
  }
  return left.trim().split("\n").length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const first = process.argv[2];
  const second = process.argv[3];
  if (!first || !second) {
    throw new Error("Usage: node scripts/compare-releases.mjs dist-a dist-b");
  }
  const count = await compareReleaseTrees(first, second);
  console.log(`Two separate static release outputs are byte-identical: ${count} assets.`);
}
