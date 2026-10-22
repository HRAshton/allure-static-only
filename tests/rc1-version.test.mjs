import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("root and packed converter SDK are staged at the same private RC1 version", async () => {
  const paths = ["package.json", "package-lock.json", "packages/converter-sdk/package.json"];
  const manifests = await Promise.all(
    paths.map(async (filename) => JSON.parse(await readFile(path.join(root, filename), "utf8"))),
  );
  const [project, lock, sdk] = manifests;
  assert.equal(project.version, "0.1.0-rc.1");
  assert.equal(lock.version, project.version);
  assert.equal(lock.packages[""].version, project.version);
  assert.equal(sdk.version, project.version);
  assert.equal(project.private, true);
  assert.equal(sdk.private, true);
});
