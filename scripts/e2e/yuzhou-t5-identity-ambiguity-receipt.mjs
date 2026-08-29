#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildT5IdentityAmbiguityReceipt, writeT5IdentityAmbiguityReceipt } from "../prepare-yuzhou-t5-identity-ambiguity-receipt.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const root = mkdtempSync(join(tmpdir(), "yuzhou-t5-identity-receipt-"));
chmodSync(root, 0o700);
const stage = join(root, "stage");
const output = join(root, "receipt.json");
await import("node:fs/promises").then(({ mkdir }) => mkdir(stage, { mode: 0o700 }));
chmodSync(stage, 0o700);
const profileRows = [
  ["a", "same"], ["b", "same"], ["c", "single"], ["d", "triple"], ["e", "triple"], ["f", "triple"], ["g", null]
].map(([id, fingerprint]) => JSON.stringify({ sourceTable: "dbo.person.core_residue", sourceIdentitySha256: hash(`identity:${id}`), sourceRowSha256: hash(`row:${id}`), materialized: { kind: "profile", idNumber: { fingerprint: fingerprint === null ? null : hash(`fingerprint:${fingerprint}`) } } })).join("\n").concat("\n");
const profiles = join(stage, "person-core.jsonl");
writeFileSync(profiles, profileRows, { mode: 0o600 }); chmodSync(profiles, 0o600);
const manifest = { artifactKind: "yuzhou_t5_nonfile_materialization_stage", productionImport: "HOLD", sourceRows: 7752, filesExcluded: ["photo", "docs"], sourceBusinessSha256: hash("business"), sourceCatalogSha256: hash("catalog"), nonfileBusinessSha256: hash("nonfile"), domains: { person_core: { sourceObject: "dbo.person.core_residue", rows: 2949, file: "person-core.jsonl", fileSha256: hash(profileRows) } } };
writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(manifest)}\n`, { mode: 0o600 }); chmodSync(join(stage, "manifest.json"), 0o600);

test("T5 identity ambiguity receipt is aggregate-only and prohibits automatic resolution", () => {
  const original = readFileSync(profiles, "utf8");
  const padded = Array.from({ length: 2942 }, (_, index) => JSON.stringify({ sourceTable: "dbo.person.core_residue", sourceIdentitySha256: hash(`identity:padding:${index}`), sourceRowSha256: hash(`row:padding:${index}`), materialized: { kind: "profile", idNumber: { fingerprint: hash(`fingerprint:padding:${index}`) } } })).join("\n");
  writeFileSync(profiles, `${original}${padded}\n`, { mode: 0o600 });
  manifest.domains.person_core.fileSha256 = hash(readFileSync(profiles));
  writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
  const receipt = buildT5IdentityAmbiguityReceipt({ stagePath: stage });
  assert.equal(receipt.sourceProfileRows, 2949);
  assert.equal(receipt.ambiguousFingerprintGroups, 2);
  assert.equal(receipt.ambiguousProfileRows, 5);
  assert.deepEqual(receipt.groupSizeHistogram, { "2": 1, "3": 1 });
  assert.equal(receipt.missingFingerprintRows, 1);
  assert.equal(receipt.automaticResolution, "prohibited");
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /identity:|fingerprint:/u);
  const saved = writeT5IdentityAmbiguityReceipt({ stagePath: stage, outputPath: output });
  assert.equal(JSON.parse(readFileSync(output, "utf8")).receiptSha256, saved.receiptSha256);
});

test("T5 identity ambiguity receipt accepts pnpm's delimiter", async () => {
  const { spawnSync } = await import("node:child_process");
  const cliOutput = join(root, "receipt-cli.json");
  const result = spawnSync(process.execPath, ["scripts/prepare-yuzhou-t5-identity-ambiguity-receipt.mjs", "--", "--stage", stage, "--output", cliOutput], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "PASS");
});

test("T5 identity ambiguity receipt treats materializer fingerprints as opaque equality tokens", () => {
  const opaqueStage = join(root, "opaque-stage");
  mkdirSync(opaqueStage, { mode: 0o700 }); chmodSync(opaqueStage, 0o700);
  const rows = Array.from({ length: 2949 }, (_, index) => JSON.stringify({ sourceTable: "dbo.person.core_residue", sourceIdentitySha256: hash(`opaque:identity:${index}`), sourceRowSha256: hash(`opaque:row:${index}`), materialized: { kind: "profile", idNumber: { fingerprint: index < 2 ? "fingerprint:v2:opaque-equality-token" : null } } })).join("\n").concat("\n");
  writeFileSync(join(opaqueStage, "person-core.jsonl"), rows, { mode: 0o600 });
  const opaqueManifest = { ...manifest, domains: { person_core: { ...manifest.domains.person_core, fileSha256: hash(rows) } } };
  writeFileSync(join(opaqueStage, "manifest.json"), `${JSON.stringify(opaqueManifest)}\n`, { mode: 0o600 });
  const receipt = buildT5IdentityAmbiguityReceipt({ stagePath: opaqueStage });
  assert.equal(receipt.ambiguousProfileRows, 2);
  assert.equal(receipt.missingFingerprintRows, 2947);
});
