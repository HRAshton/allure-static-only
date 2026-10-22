import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { compareReleaseTrees } from "../scripts/compare-releases.mjs";
import { prepareRelease } from "../scripts/release-assets.mjs";

async function makePreparedRelease() {
  const dist = await mkdtemp(path.join(tmpdir(), "allure-two-builds-"));
  await writeFile(path.join(dist, "index.html"), "<html>report</html>");
  await writeFile(path.join(dist, "manifest.json"), "{}");
  await writeFile(path.join(dist, "bootstrap.mjs"), "window.allure = {};");
  await prepareRelease(dist);
  return dist;
}

test("separate prepared releases compare byte-for-byte and require separate paths", async () => {
  const first = await makePreparedRelease();
  const second = await makePreparedRelease();
  try {
    assert.ok((await compareReleaseTrees(first, second)) >= 5);
    await assert.rejects(compareReleaseTrees(first, first), /independent output directories/);
  } finally {
    await Promise.all([
      rm(first, { recursive: true, force: true }),
      rm(second, { recursive: true, force: true }),
    ]);
  }
});

test("individually valid builds with different contents are not reproducible", async () => {
  const first = await makePreparedRelease();
  const second = await makePreparedRelease();
  try {
    await writeFile(path.join(second, "index.html"), "<html>changed</html>");
    await prepareRelease(second);
    await assert.rejects(compareReleaseTrees(first, second), /not byte-identical/);
  } finally {
    await Promise.all([
      rm(first, { recursive: true, force: true }),
      rm(second, { recursive: true, force: true }),
    ]);
  }
});
