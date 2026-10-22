import { safeReportPath } from "../domain/safe-path.ts";

const MAX_ZIP_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 2_000;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 128 * 1024 * 1024;
const MAX_RATIO = 100;
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_EOCD = 0x06054b50;

export class InvalidZipReportError extends Error {
  constructor(message: string) {
    super(`Invalid report ZIP: ${message}`);
    this.name = "InvalidZipReportError";
  }
}

function ensureActive(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new InvalidZipReportError("import cancelled");
  }
}

const crcTable = Uint32Array.from({ length: 256 }, (_, entry) => {
  let value = entry;
  for (let i = 0; i < 8; i += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc = (crcTable[(crc ^ value) & 255] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getHeader(view: DataView, start: number, size: number): void {
  if (start < 0 || size < 0 || start > view.byteLength - size) {
    throw new InvalidZipReportError("truncated header");
  }
}

async function inflateBounded(
  input: Uint8Array,
  expectedSize: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const stream = new Blob([input]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      ensureActive(signal);
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      received += value.byteLength;
      if (received > expectedSize || received > MAX_ENTRY_BYTES) {
        void reader.cancel();
        throw new InvalidZipReportError("expanded content exceeds declared size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/** Strict, size-bounded ZIP32 import. ZIP64 and encrypted entries are rejected. */
export async function unzipReportFiles(zip: File, signal?: AbortSignal): Promise<readonly File[]> {
  ensureActive(signal);
  if (zip.size < 22 || zip.size > MAX_ZIP_BYTES) {
    throw new InvalidZipReportError("source size limit exceeded");
  }
  const bytes = new Uint8Array(await zip.arrayBuffer());
  ensureActive(signal);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i -= 1) {
    if (
      view.getUint32(i, true) === ZIP_EOCD &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new InvalidZipReportError("missing end-of-directory header");
  }
  const disk = view.getUint16(eocd + 4, true);
  const directoryDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralBytes = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (disk || directoryDisk || diskEntries !== entryCount || entryCount > MAX_ENTRIES) {
    throw new InvalidZipReportError("multi-volume archive or excessive file count");
  }
  getHeader(view, centralOffset, centralBytes);
  if (centralOffset + centralBytes > eocd) {
    throw new InvalidZipReportError("invalid central directory");
  }

  const results: File[] = [];
  const seen = new Set<string>();
  const occupied: Array<{ start: number; end: number }> = [];
  let total = 0;
  let cursor = centralOffset;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let index = 0; index < entryCount; index += 1) {
    ensureActive(signal);
    getHeader(view, cursor, 46);
    if (view.getUint32(cursor, true) !== ZIP_CENTRAL) {
      throw new InvalidZipReportError("invalid central file header");
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const expandedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const externalMode = view.getUint32(cursor + 38, true) >>> 16;
    const localOffset = view.getUint32(cursor + 42, true);
    getHeader(view, cursor + 46, nameLength + extraLength + commentLength);
    let name: string;
    try {
      name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    } catch {
      throw new InvalidZipReportError("entry name is not valid UTF-8");
    }
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!name || (externalMode & 0xf000) === 0xa000) {
      throw new InvalidZipReportError("invalid filename or symbolic link");
    }
    const directory = name.endsWith("/");
    let normalized: string;
    try {
      normalized = safeReportPath(directory ? name.slice(0, -1) : name);
    } catch {
      throw new InvalidZipReportError("unsafe archive path");
    }
    if (directory) {
      continue;
    }
    if (seen.has(normalized)) {
      throw new InvalidZipReportError("duplicate archive entry");
    }
    seen.add(normalized);
    if (flags & 1 || (method !== 0 && method !== 8)) {
      throw new InvalidZipReportError("encrypted or unsupported compression method");
    }
    if (
      compressedSize === 0xffffffff ||
      expandedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      throw new InvalidZipReportError("ZIP64 archive not supported");
    }
    if (
      expandedSize > MAX_ENTRY_BYTES ||
      (expandedSize > 0 && compressedSize === 0) ||
      expandedSize > compressedSize * MAX_RATIO
    ) {
      throw new InvalidZipReportError("oversize or high-ratio archive entry");
    }
    total += expandedSize;
    if (total > MAX_EXPANDED_BYTES) {
      throw new InvalidZipReportError("expanded size limit exceeded");
    }
    getHeader(view, localOffset, 30);
    if (view.getUint32(localOffset, true) !== ZIP_LOCAL) {
      throw new InvalidZipReportError("invalid local file header");
    }
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    getHeader(view, localOffset + 30, localNameLength + localExtraLength);
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    const centralName = bytes.subarray(
      cursor - commentLength - extraLength - nameLength,
      cursor - commentLength - extraLength,
    );
    if (
      localFlags !== flags ||
      localMethod !== method ||
      localNameLength !== nameLength ||
      !localName.every((value, index) => value === centralName[index])
    ) {
      throw new InvalidZipReportError("local and central headers disagree");
    }
    if (
      !(flags & 8) &&
      (view.getUint32(localOffset + 14, true) !== expectedCrc ||
        view.getUint32(localOffset + 18, true) !== compressedSize ||
        view.getUint32(localOffset + 22, true) !== expandedSize)
    ) {
      throw new InvalidZipReportError("local and central checksums or sizes disagree");
    }
    const offset =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    getHeader(view, offset, compressedSize);
    if (offset + compressedSize > centralOffset) {
      throw new InvalidZipReportError("file content overlaps central directory");
    }
    const region = { start: localOffset, end: offset + compressedSize };
    if (occupied.some((used) => region.start < used.end && region.end > used.start)) {
      throw new InvalidZipReportError("overlapping archive entries");
    }
    occupied.push(region);
    const input = bytes.subarray(offset, offset + compressedSize);
    let output: Uint8Array;
    if (method === 0) {
      output = input;
    } else {
      try {
        output = await inflateBounded(input, expandedSize, signal);
      } catch (error) {
        if (error instanceof InvalidZipReportError) {
          throw error;
        }
        throw new InvalidZipReportError("decompression failed");
      }
    }
    ensureActive(signal);
    if (output.byteLength !== expandedSize || crc32(output) !== expectedCrc) {
      throw new InvalidZipReportError("size or checksum mismatch");
    }
    const filename = normalized.split("/").at(-1) ?? "unknown";
    const file = new File([output], filename);
    Object.defineProperty(file, "webkitRelativePath", { value: normalized });
    results.push(file);
  }
  if (cursor !== centralOffset + centralBytes) {
    throw new InvalidZipReportError("central directory length mismatch");
  }
  return results;
}
