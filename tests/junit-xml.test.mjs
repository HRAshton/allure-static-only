import assert from "node:assert/strict";
import test from "node:test";

import { junitXmlConverter } from "../src/converters/junit-xml.ts";

const input = (path, text) => ({
  path,
  byteLength: new TextEncoder().encode(text).length,
  read: async () => new TextEncoder().encode(text),
});
const suite = '<?xml version="1.0"?><testsuite name="Sample"><testcase name="works"/></testsuite>';

test("registers JUnit XML detection by content, not filename alone", async () => {
  assert.equal(await junitXmlConverter.detect([input("report.xml", suite)]), 95);
  assert.equal(await junitXmlConverter.detect([input("report.xml", "<data />")]), 0);
  assert.equal(await junitXmlConverter.detect([input("report.json", suite)]), 0);
  assert.equal(await junitXmlConverter.detect([input("not-a-report.xml", "")]), 0);
});

test("rejects unsafe DTD and non-UTF8 JUnit documents", async () => {
  const data = '<!DOCTYPE testsuite [<!ENTITY x SYSTEM "file:///etc/passwd">]><testsuite/>';
  // The safety policy is checked before invoking DOMParser.
  await assert.rejects(
    junitXmlConverter.convert([input("unsafe.xml", data)], { isCancelled: () => false }),
    /DOCTYPE and entities are not supported/,
  );
});

test("checks cancellation before parsing and enforces XML byte limits", async () => {
  await assert.rejects(
    junitXmlConverter.convert([input("junit.xml", suite)], { isCancelled: () => true }),
    /cancelled/,
  );
  const huge = {
    path: "oversize.xml",
    byteLength: 8 * 1024 * 1024 + 1,
    read: async () => {
      throw new Error("Oversized input must not be read");
    },
  };
  await assert.rejects(
    junitXmlConverter.convert([huge], { isCancelled: () => false }),
    /8 MiB limit/,
  );
});
