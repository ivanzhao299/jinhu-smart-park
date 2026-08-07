import assert from "node:assert/strict";
import test from "node:test";
import { formatBinarySize, parseAndroidReleaseManifest } from "./android-release";

const validManifest = {
  platform: "android",
  versionCode: 1,
  versionName: "1.0.0",
  fileName: "smart-park-v1.0.0.apk",
  downloadUrl: "/downloads/android/smart-park-v1.0.0.apk",
  sha256: "a".repeat(64),
  sizeBytes: 6_291_456,
  builtAt: "2026-08-07T00:00:00Z",
  commit: "abcdef1",
  releaseNotes: "首次发布"
};

test("parseAndroidReleaseManifest accepts the shared Android release contract", () => {
  assert.deepEqual(parseAndroidReleaseManifest(validManifest), validManifest);
});

test("parseAndroidReleaseManifest rejects a non-release download path", () => {
  assert.throws(() => parseAndroidReleaseManifest({ ...validManifest, downloadUrl: "https://example.com/app.apk" }), /下载地址无效/);
});

test("formatBinarySize formats client download sizes", () => {
  assert.equal(formatBinarySize(6_291_456), "6.0 MB");
});
