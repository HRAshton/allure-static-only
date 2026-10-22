import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CONTENT_SECURITY_POLICY, STATIC_SECURITY_HEADERS } from "../scripts/static-security.mjs";

test("static security policy blocks executable report content and remote data access", async () => {
  assert.ok(CONTENT_SECURITY_POLICY.includes("script-src 'self'"));
  assert.ok(CONTENT_SECURITY_POLICY.includes("object-src 'none'"));
  assert.ok(CONTENT_SECURITY_POLICY.includes("connect-src 'self'"));
  assert.ok(CONTENT_SECURITY_POLICY.includes("base-uri 'self'"));
  assert.equal(CONTENT_SECURITY_POLICY.includes("unsafe-eval"), false);
  assert.equal(CONTENT_SECURITY_POLICY.includes("unsafe-inline';"), true);
  const scriptPolicy = CONTENT_SECURITY_POLICY.split(";").find((part) =>
    part.trim().startsWith("script-src"),
  );
  assert.equal(scriptPolicy?.includes("unsafe-inline"), false);
  assert.equal(STATIC_SECURITY_HEADERS["x-content-type-options"], "nosniff");

  const nginx = await readFile(new URL("../deployment/nginx.conf", import.meta.url), "utf8");
  assert.ok(
    nginx.includes(`add_header Content-Security-Policy "${CONTENT_SECURITY_POLICY}" always;`),
  );
  assert.ok(nginx.includes('add_header X-Frame-Options "DENY" always;'));
  assert.ok(nginx.includes('add_header Referrer-Policy "no-referrer" always;'));
});
