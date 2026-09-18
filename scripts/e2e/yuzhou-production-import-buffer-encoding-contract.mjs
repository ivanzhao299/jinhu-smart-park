import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import test from "node:test";
import { encodeFrozenArtifactBytes, computeFrozenArtifactHash } from "../hr-cutover/production-import-payload-generator.mjs";
import { stableProductionImportCanonicalJson } from "../hr-cutover/production-import-target-model.mjs";

test("buffer encoding preserves canonical bytes, integer keys, Unicode and trailing newline", () => {
  const values = [null, true, -0, Number.MAX_SAFE_INTEGER, "玉舟😀\ud800\n", [], {},
    { z: [null, false, { "10": "十", "2": "二", "01": "零一", a: "\\\"" }], a: -3 }];
  for (const value of values) {
    const before = globalThis.structuredClone(value), bytes = encodeFrozenArtifactBytes(value);
    assert.deepEqual(bytes, Buffer.from(stableProductionImportCanonicalJson(value) + "\n"));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), computeFrozenArtifactHash(value));
    assert.deepEqual(value, before);
  }
});

test("buffer encoding retains canonical value rejection", () => {
  for (const value of [undefined, NaN, Infinity, 1.5, 1n, new Date(), { a: undefined }]) {
    let existing;
    try { computeFrozenArtifactHash(value); } catch (error) { existing = error; }
    assert.ok(existing);
    assert.throws(() => encodeFrozenArtifactBytes(value), { name: existing.name, code: existing.code, message: existing.message });
  }
});

test("large synthetic rows preserve bytes and do not share output buffers", () => {
  const value = { records: Array.from({ length: 10000 }, (_, id) => ({ id, text: "synthetic-测试", values: [id, true] })) };
  const bytes = encodeFrozenArtifactBytes(value), second = encodeFrozenArtifactBytes(value);
  assert.deepEqual(bytes, Buffer.from(stableProductionImportCanonicalJson(value) + "\n"));
  bytes[0] = 0;
  assert.equal(second[0], 123);
  assert.equal(value.records.length, 10000);
});
