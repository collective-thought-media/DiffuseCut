import fs from "fs";

export type ImageDimensions = { width: number; height: number };

/**
 * Read pixel dimensions from a PNG, JPEG, or WebP file header without image
 * library dependencies. Returns null when the format is unrecognized or the
 * file is unreadable.
 */
export function readImageDimensions(filePath: string): ImageDimensions | null {
  let buffer: Buffer;
  try {
    // 64 KB covers PNG IHDR, WebP headers, and JPEG SOF in practice
    // (JPEG SOF can technically sit later; fall through to null if so).
    const fd = fs.openSync(filePath, "r");
    try {
      buffer = Buffer.alloc(65536);
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
      buffer = buffer.subarray(0, bytes);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }

  return (
    readPngDimensions(buffer) ??
    readJpegDimensions(buffer) ??
    readWebpDimensions(buffer)
  );
}

function readPngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24) return null;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  if (!isPng) return null;
  // IHDR is always the first chunk: width/height at offsets 16/20.
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

function readJpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0-SOF15 except DHT (C4), JPG (C8), DAC (CC)
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      if (!width || !height) return null;
      return { width, height };
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

function readWebpDimensions(buffer: Buffer): ImageDimensions | null {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }
  const format = buffer.toString("ascii", 12, 16);
  if (format === "VP8 ") {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (format === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (format === "VP8X") {
    return {
      width: (buffer.readUIntLE(24, 3) & 0xffffff) + 1,
      height: (buffer.readUIntLE(27, 3) & 0xffffff) + 1,
    };
  }
  return null;
}
