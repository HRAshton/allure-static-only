import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

import { InvalidZipReportError, unzipReportFiles } from "../src/runtime/unzip-report.ts";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let index = 0; index < 8; index += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(filename, contents, compressed = true) {
  const name = Buffer.from(filename);
  const data = Buffer.from(contents);
  const body = compressed ? deflateRawSync(data) : data;
  const method = compressed ? 8 : 0;
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  const centralOffset = local.length + name.length + body.length;
  const centralSize = central.length + name.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return new File([Buffer.concat([local, name, body, central, name, eocd])], "report.zip");
}

test("extracts deflated and stored ZIP32 report entries locally", async () => {
  for (const compressed of [true, false]) {
    const entries = await unzipReportFiles(
      makeZip("allure-results/one-result.json", '{"name":"ok"}', compressed),
    );
    assert.equal(entries.length, 1);
    assert.equal(entries[0].webkitRelativePath, "allure-results/one-result.json");
    assert.equal(await entries[0].text(), '{"name":"ok"}');
  }
});

test("rejects traversal, checksum corruption, and cancellation", async () => {
  await assert.rejects(
    unzipReportFiles(makeZip("../escape-result.json", "{}")),
    /unsafe archive path/,
  );
  const damaged = new Uint8Array(await makeZip("good-result.json", "{}").arrayBuffer());
  damaged[50] ^= 5;
  await assert.rejects(unzipReportFiles(new File([damaged], "broken.zip")), InvalidZipReportError);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    unzipReportFiles(makeZip("one-result.json", "{}"), controller.signal),
    /cancelled/,
  );
});

test("rejects mismatched local filename even if central path is safe", async () => {
  const corrupt = new Uint8Array(
    await makeZip("good-result.json", '{"uuid":"a"}', false).arrayBuffer(),
  );
  // Alter only the local header's first filename character, preserving the central directory.
  corrupt[30] = ".".charCodeAt(0);
  await assert.rejects(
    unzipReportFiles(new File([corrupt], "deceptive.zip")),
    /local and central headers disagree/,
  );
});

test("blocks excessively compressible report entries", async () => {
  const bomb = makeZip("high-ratio-result.json", "x".repeat(100_000));
  await assert.rejects(unzipReportFiles(bomb), /high-ratio/);
});
