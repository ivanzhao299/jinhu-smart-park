#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY,
  detectYuzhouPhotoMagic,
  photoNormalizationPreflightPolicyHash,
  preflightYuzhouPhotoBinary
} from "../hr-cutover/yuzhou-photo-normalization-preflight.mjs";

const root = resolve(import.meta.dirname, "../..");
const sharedPolicy = readFileSync(resolve(root, "packages/shared/src/index.ts"), "utf8");

const png = (width, height) => Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
  (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff
]);
const gif = (width, height) => Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, width & 0xff, width >>> 8, height & 0xff, height >>> 8]);
const bmp = (width, height) => {
  const bytes = Buffer.alloc(54);
  bytes.write("BM", 0, "ascii");
  bytes.writeUInt32LE(40, 14);
  bytes.writeInt32LE(width, 18);
  bytes.writeInt32LE(height, 22);
  bytes.writeUInt16LE(1, 26);
  bytes.writeUInt16LE(24, 28);
  return bytes;
};
const jpeg = (width, height) => Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x08, 0x08,
  height >>> 8, height & 0xff, width >>> 8, width & 0xff, 0x03,
  0xff, 0xd9
]);

test("preflight policy is pinned to the shared hr employee photo upload limit", () => {
  assert.equal(YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY.maxBytes, 20 * 1024 * 1024);
  assert.equal(YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY.version, "yuzhou-photo-normalization-preflight-v1");
  assert.deepEqual(YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY.acceptedSourceMagic, ["JPEG", "PNG", "GIF", "BMP"]);
  assert.match(sharedPolicy, /hr_employee_photo:\s*"image"/u);
  assert.match(sharedPolicy, /image:\s*\{[\s\S]*?maxSizeBytes:\s*20 \* 1024 \* 1024/u);
  assert.match(photoNormalizationPreflightPolicyHash(), /^[0-9a-f]{64}$/u);
});

test("accepted source headers return dimensions but never a write decision", () => {
  for (const [magic, bytes] of [["JPEG", jpeg(640, 480)], ["PNG", png(640, 480)], ["GIF", gif(640, 480)], ["BMP", bmp(640, -480)]]) {
    assert.equal(detectYuzhouPhotoMagic(bytes), magic);
    assert.deepEqual(preflightYuzhouPhotoBinary(bytes), {
      decision: "CONTINUE_SAFE_DECODE",
      reasonCode: null,
      sourceMagic: magic,
      dimensions: { width: 640, height: 480 }
    });
  }
});

test("empty, unknown, malformed and oversized inputs remain quarantined", () => {
  assert.deepEqual(preflightYuzhouPhotoBinary(Buffer.alloc(0)), { decision: "QUARANTINE", reasonCode: "EMPTY_BINARY", sourceMagic: null, dimensions: null });
  assert.deepEqual(preflightYuzhouPhotoBinary(Buffer.from([0x01, 0x02, 0x03])), { decision: "QUARANTINE", reasonCode: "UNKNOWN_MAGIC", sourceMagic: null, dimensions: null });
  assert.deepEqual(preflightYuzhouPhotoBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), { decision: "QUARANTINE", reasonCode: "DECODE_FAILED", sourceMagic: "PNG", dimensions: null });
  assert.deepEqual(preflightYuzhouPhotoBinary(Buffer.alloc(YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY.maxBytes + 1)), { decision: "QUARANTINE", reasonCode: "BYTE_LIMIT_EXCEEDED", sourceMagic: null, dimensions: null });
});

test("dimension and pixel limits fail before any decoder is invoked", () => {
  assert.deepEqual(preflightYuzhouPhotoBinary(png(12_001, 1)), {
    decision: "QUARANTINE", reasonCode: "DIMENSION_LIMIT_EXCEEDED", sourceMagic: "PNG", dimensions: { width: 12_001, height: 1 }
  });
  assert.deepEqual(preflightYuzhouPhotoBinary(png(10_000, 10_000)), {
    decision: "QUARANTINE", reasonCode: "DIMENSION_LIMIT_EXCEEDED", sourceMagic: "PNG", dimensions: { width: 10_000, height: 10_000 }
  });
});

test("callers cannot override the pinned policy or pass non-binary input", () => {
  assert.throws(() => preflightYuzhouPhotoBinary("not-a-buffer"), error => error?.code === "YUZHOU_PHOTO_PREFLIGHT_INPUT_INVALID");
  assert.throws(() => preflightYuzhouPhotoBinary(png(1, 1), { policy: { ...YUZHOU_PHOTO_NORMALIZATION_PREFLIGHT_POLICY } }), error => error?.code === "YUZHOU_PHOTO_PREFLIGHT_POLICY_OVERRIDE_FORBIDDEN");
});
