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

test("rejects hostile absolute, control-character and traversal ZIP filenames", async () => {
  for (const name of [
    "/secret-result.json",
    "C:\\secret-result.json",
    "nested/../escape-result.json",
    "nested/./invalid-result.json",
    "nested//invalid-result.json",
    "nested\\..\\escape-result.json",
    "report\0result.json",
  ]) {
    await assert.rejects(unzipReportFiles(makeZip(name, "{}", false)), /unsafe archive path/);
  }
});

test("rejects encrypted and ZIP64 entries without attempting decompression", async () => {
  const encrypted = new Uint8Array(await makeZip("safe-result.json", "{}", false).arrayBuffer());
  const encryptedView = new DataView(encrypted.buffer);
  const encryptedDirectory = encryptedView.getUint32(encrypted.byteLength - 6, true);
  encryptedView.setUint16(6, 1, true);
  encryptedView.setUint16(encryptedDirectory + 8, 1, true);
  await assert.rejects(unzipReportFiles(new File([encrypted], "encrypted.zip")), /encrypted/);

  const zip64 = new Uint8Array(await makeZip("safe-result.json", "{}", false).arrayBuffer());
  const zip64View = new DataView(zip64.buffer);
  const zip64Directory = zip64View.getUint32(zip64.byteLength - 6, true);
  zip64View.setUint32(zip64Directory + 24, 0xffffffff, true);
  await assert.rejects(unzipReportFiles(new File([zip64], "zip64.zip")), /ZIP64/);
});

test("rejects claimed excessive archive entry counts before reading entries", async () => {
  const oversized = new Uint8Array(await makeZip("safe-result.json", "{}", false).arrayBuffer());
  const view = new DataView(oversized.buffer);
  const end = oversized.byteLength - 22;
  view.setUint16(end + 8, 2_001, true);
  view.setUint16(end + 10, 2_001, true);
  await assert.rejects(unzipReportFiles(new File([oversized], "too-many.zip")), /file count/);
});
