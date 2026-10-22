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
    assert.match(original, / {2}LICENSES\/0BSD\.txt\n/);
    assert.match(original, / {2}LICENSES\/Apache-2\.0\.txt\n/);
    assert.match((await readFile(path.join(dist, "LICENSES", "0BSD.txt"), "utf8")), /AS IS/);
    assert.match(original, / {2}provenance\.json\n/);
    assert.match(original, / {2}third-party-license-files\.json\n/);
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
test("bundler-emitted license files are inventoried, hashed and tamper-evident", async () => {
  const dist = await fixture();
  try {
    await writeFile(path.join(dist, "nested", "vendor.js.LICENSE.txt"), "MIT license text");
    await prepareRelease(dist);
    await verifyRelease(dist);
    const index = JSON.parse(
      await readFile(path.join(dist, "third-party-license-files.json"), "utf8"),
    );
    assert.equal(index.schemaVersion, 1);
    assert.equal(index.notices.length, 1);
    assert.equal(index.notices[0].filename, "nested/vendor.js.LICENSE.txt");
    assert.match(index.notices[0].sha256, /^[a-f0-9]{64}$/);
    await writeFile(path.join(dist, "nested", "vendor.js.LICENSE.txt"), "edited license");
    await assert.rejects(verifyRelease(dist), /SHA256SUMS mismatch/);
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});
