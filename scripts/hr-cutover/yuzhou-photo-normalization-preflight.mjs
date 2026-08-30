import { createHash } from "node:crypto";

/**
 * This preflight intentionally stops before decoding or writing a binary. It is
 * the deterministic, low-cost first gate for the later isolated photo worker.
 */
export const YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY = Object.freeze({
  version: "yuzhou-photo-normalization-preflight-v1",
  acceptedSourceMagic: Object.freeze(["JPEG", "PNG", "GIF", "BMP"]),
  maxBytes: 20 * 1024 * 1024,
  maxDimension: 12_000,
  maxPixels: 50_000_000
});

export class YuzhouPhotoNormalizationPreflightError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "YuzhouPhotoNormalizationPreflightError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new YuzhouPhotoNormalizationPreflightError(code, detail); };
const sha = value => createHash("sha256").update(value).digest("hex");

export const photoNormalizationPreflightPolicyHash = () =>
  sha(JSON.stringify(YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY));

const hasBytes = (bytes, offset, length) => offset >= 0 && length >= 0 && offset + length <= bytes.length;
const readU16BE = (bytes, offset) => bytes.readUInt16BE(offset);
const readU16LE = (bytes, offset) => bytes.readUInt16LE(offset);
const readU32BE = (bytes, offset) => bytes.readUInt32BE(offset);
const readI32LE = (bytes, offset) => bytes.readInt32LE(offset);

const jpegDimensions = bytes => {
  if (!hasBytes(bytes, 0, 2) || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xda) return null;
    if (!hasBytes(bytes, offset, 2)) return null;
    const segmentLength = readU16BE(bytes, offset);
    if (segmentLength < 2 || !hasBytes(bytes, offset, segmentLength)) return null;
    const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      if (segmentLength < 8) return null;
      return { width: readU16BE(bytes, offset + 5), height: readU16BE(bytes, offset + 3) };
    }
    offset += segmentLength;
  }
  return null;
};

const pngDimensions = bytes => {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!hasBytes(bytes, 0, 24) || signature.some((value, index) => bytes[index] !== value)) return null;
  if (readU32BE(bytes, 8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: readU32BE(bytes, 16), height: readU32BE(bytes, 20) };
};

const gifDimensions = bytes => {
  if (!hasBytes(bytes, 0, 10)) return null;
  const signature = bytes.toString("ascii", 0, 6);
  if (signature !== "GIF87a" && signature !== "GIF89a") return null;
  return { width: readU16LE(bytes, 6), height: readU16LE(bytes, 8) };
};

const bmpDimensions = bytes => {
  if (!hasBytes(bytes, 0, 26) || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return null;
  const dibSize = bytes.readUInt32LE(14);
  if (dibSize < 40 || !hasBytes(bytes, 14, dibSize)) return null;
  const width = readI32LE(bytes, 18), height = readI32LE(bytes, 22);
  return { width, height: Math.abs(height) };
};

const inspectDimensions = (sourceMagic, bytes) => {
  switch (sourceMagic) {
    case "JPEG": return jpegDimensions(bytes);
    case "PNG": return pngDimensions(bytes);
    case "GIF": return gifDimensions(bytes);
    case "BMP": return bmpDimensions(bytes);
    default: return null;
  }
};

export const detectYuzhouPhotoMagic = bytes => {
  if (!Buffer.isBuffer(bytes)) fail("YUZHOU_PHOTO_PREFLIGHT_INPUT_INVALID", "binary input must be a Buffer");
  if (bytes.length === 0) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "JPEG";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "PNG";
  if (bytes.toString("ascii", 0, 6) === "GIF87a" || bytes.toString("ascii", 0, 6) === "GIF89a") return "GIF";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "BMP";
  return null;
};

const quarantine = (reasonCode, sourceMagic = null, dimensions = null) => ({
  decision: "QUARANTINE",
  reasonCode,
  sourceMagic,
  dimensions
});

export function preflightYuzhouPhotoBinary(bytes, { policy = YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY } = {}) {
  if (!Buffer.isBuffer(bytes)) fail("YUZHOU_PHOTO_PREFLIGHT_INPUT_INVALID", "binary input must be a Buffer");
  if (policy !== YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY) fail("YUZHOU_PHOTO_PREFLIGHT_POLICY_OVERRIDE_FORBIDDEN", "the pinned policy is required");
  if (bytes.length === 0) return quarantine("EMPTY_BINARY");
  if (bytes.length > policy.maxBytes) return quarantine("BYTE_LIMIT_EXCEEDED");
  const sourceMagic = detectYuzhouPhotoMagic(bytes);
  if (!sourceMagic) return quarantine("UNKNOWN_MAGIC");
  const dimensions = inspectDimensions(sourceMagic, bytes);
  if (!dimensions || !Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height) || dimensions.width < 1 || dimensions.height < 1) {
    return quarantine("DECODE_FAILED", sourceMagic);
  }
  if (dimensions.width > policy.maxDimension || dimensions.height > policy.maxDimension || dimensions.width * dimensions.height > policy.maxPixels) {
    return quarantine("DIMENSION_LIMIT_EXCEEDED", sourceMagic, dimensions);
  }
  return {
    decision: "CONTINUE_SAFE_DECODE",
    reasonCode: null,
    sourceMagic,
    dimensions
  };
}
