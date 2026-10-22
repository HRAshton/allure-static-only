import assert from "node:assert/strict";
import test from "node:test";

import { staticContentType } from "../scripts/static-content-types.mjs";

test("ES modules are served with a JavaScript MIME type", () => {
  assert.match(staticContentType("import-generated.mjs"), /^text\/javascript/);
  assert.match(staticContentType("app-a123.js"), /^text\/javascript/);
});

test("unknown extensions cannot execute as browser modules", () => {
  assert.equal(staticContentType("artifact.xyz"), "application/octet-stream");
});
