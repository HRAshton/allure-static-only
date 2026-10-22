import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { prepareRelease, verifyRelease } from "../scripts/release-assets.mjs";

async function fixture() {
  const dist = await mkdtemp(path.join(tmpdir(), "allure-release-"));
  await mkdir(path.join(dist, "nested"));
  await writeFile(path.join(dist, "index.html"), "<h1>offline static report</h1>");
  await writeFile(path.join(dist, "manifest.json"), "{}");
  await writeFile(path.join(dist, "bootstrap.mjs"), "window.allure = {};");
  await writeFile(path.join(dist, "nested", "asset.js"), "export const x = 1;");
  return dist;
}

test("release files have stable sorted checksums and frozen source provenance", async () => {
  const dist = await fixture();
  try {
    await prepareRelease(dist);
    await verifyRelease(dist);
    const original = await readFile(path.join(dist, "SHA256SUMS"), "utf8");
    assert.match(original, / {2}NOTICE\.txt\n/);
    assert.match(original, / {2}provenance\.json\n/);
    assert.equal(original.includes("  SHA256SUMS"), false);
    await prepareRelease(dist);
    assert.equal(await readFile(path.join(dist, "SHA256SUMS"), "utf8"), original);
    await writeFile(path.join(dist, "nested", "asset.js"), "tampered");
    await assert.rejects(verifyRelease(dist), /SHA256SUMS mismatch/);
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});

test("unexpected files and symlinks fail closed", async () => {
  const dist = await fixture();
  try {
    await prepareRelease(dist);
    await writeFile(path.join(dist, "injected.html"), "<script>evil()</script>");
    await assert.rejects(verifyRelease(dist), /SHA256SUMS mismatch/);
    await symlink(path.join(dist, "index.html"), path.join(dist, "linked.html"));
    await assert.rejects(verifyRelease(dist), /Symlink not allowed/);
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});
