/* global Buffer, structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { stableProductionImportCanonicalJson as canonical } from "../hr-cutover/production-import-target-model.mjs";
import { productionT3ArtifactJsonChunks as chunks, hashProductionT3ArtifactJson as artifactHash } from "../hr-cutover/production-t3-artifact-json.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
test("record-chunk serialization has exactly the existing canonical UTF-8 bytes and newline", () => {
  for (const value of [
    { records: [] },
    { z: "last", records: [{ z: null, a: "中文\n😀", nested: { 10: "ten", 2: "two", a: [true, false, null, -0] } }], a: 1 },
    { 10: "ten", 2: "two", records: [null, "\ud800", Number.MAX_SAFE_INTEGER, ["x", { b: 2, a: 1 }]] },
    { records: Array(2), scope: { parkId: "synthetic", tenantId: "synthetic" } },
  ]) {
    const expected = `${canonical(value)}\n`, before = structuredClone(value);
    assert.equal([...chunks(value)].join(""), expected);
    assert.equal(artifactHash(value), hash(expected));
    assert.deepEqual(value, before);
  }
});

test("records are serialized lazily without a whole-array canonical copy", () => {
  let reads = 0;
  const row = {};
  Object.defineProperty(row, "value", { enumerable: true, get() { reads++; return "synthetic"; } });
  const iterator = chunks({ records: [row] });
  assert.equal(iterator.next().value, "{");
  assert.equal(reads, 0);
  assert.equal([...iterator].join(""), '"records":[{"value":"synthetic"}]}\n');
  assert.equal(reads, 1);
});

test("multi-megabyte record arrays retain per-record chunk bounds and exact hash", () => {
  const value = { phase: "T3", records: Array.from({ length: 5000 }, (_, index) => ({ index, sourceRowSha256: hash(String(index)), text: "x".repeat(512) })) };
  let total = 0, maximum = 0;
  const digest = createHash("sha256");
  for (const part of chunks(value)) { const bytes = Buffer.byteLength(part); total += bytes; maximum = Math.max(maximum, bytes); digest.update(part); }
  assert.ok(total > 3_000_000);
  assert.ok(maximum < 1024);
  assert.equal(digest.digest("hex"), hash(`${canonical(value)}\n`));
});

test("invalid envelopes and non-JSON record values cannot become apparent valid artifacts", () => {
  for (const value of [null, [], {}, { records: null }, Object.assign(Object.create(null), { records: [] })]) {
    assert.throws(() => [...chunks(value)], /T3_ARTIFACT_JSON_INVALID/u);
  }
  for (const value of [undefined, NaN, Infinity, 1.5, 1n, new Date(0), () => 1]) {
    assert.throws(() => [...chunks({ records: [value] })]);
  }
});
