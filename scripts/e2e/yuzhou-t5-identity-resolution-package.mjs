#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyT5IdentityResolutionPackage } from "../verify-yuzhou-t5-identity-resolution-package.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const root = mkdtempSync(join(tmpdir(), "yuzhou-t5-identity-resolution-"));
const stage = join(root, "stage"), decision = join(root, "decision.json");
mkdirSync(stage, { mode: 0o700 }); chmodSync(stage, 0o700);
const rows = Array.from({ length: 2949 }, (_, index) => JSON.stringify({
  sourceTable: "dbo.person.core_residue", sourceIdentitySha256: hash(`profile:${index}`), sourceRowSha256: hash(`row:${index}`),
  materialized: { kind: "profile", disposition: "loaded", idNumber: { fingerprint: index < 2 ? "hmac256:shared" : null } }
})).join("\n").concat("\n");
writeFileSync(join(stage, "person-core.jsonl"), rows, { mode: 0o600 }); chmodSync(join(stage, "person-core.jsonl"), 0o600);
const manifest = { artifactKind: "yuzhou_t5_nonfile_materialization_stage", productionImport: "HOLD", sourceRows: 7752, filesExcluded: ["photo", "docs"], sourceBusinessSha256: hash("business"), sourceCatalogSha256: hash("catalog"), nonfileBusinessSha256: hash("nonfile"), domains: { person_core: { sourceObject: "dbo.person.core_residue", rows: 2949, file: "person-core.jsonl", fileSha256: hash(rows) } } };
writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(manifest)}\n`, { mode: 0o600 }); chmodSync(join(stage, "manifest.json"), 0o600);
const packageFor = decisions => ({ formatVersion: 1, artifactKind: "yuzhou_t5_profile_identity_resolution", sourceSystem: "yuzhou-v10", sourceBusinessSha256: manifest.sourceBusinessSha256, sourceCatalogSha256: manifest.sourceCatalogSha256, nonfileBusinessSha256: manifest.nonfileBusinessSha256, reviewerSubjectSha256: hash("reviewer"), decisions, productionImport: "HOLD" });
const writeDecision = value => { writeFileSync(decision, `${JSON.stringify(value)}\n`, { mode: 0o600 }); chmodSync(decision, 0o600); };

test("T5 identity resolution package requires full, exact, reviewed candidate coverage", () => {
  const sourceA = hash("profile:0"), sourceB = hash("profile:1");
  writeDecision(packageFor([
    { profileSourceIdentitySha256: sourceA, targetPersonSourceIdentitySha256: hash("person:approved-a"), disposition: "map", reasonCode: "T5_IDENTITY_REVIEWED_EXACT_T0" },
    { profileSourceIdentitySha256: sourceB, targetPersonSourceIdentitySha256: null, disposition: "quarantine", reasonCode: "T5_IDENTITY_REVIEWED_DEFERRED" }
  ]));
  const result = verifyT5IdentityResolutionPackage({ stagePath: stage, decisionPath: decision });
  assert.deepEqual({ candidateCount: result.candidateCount, mapCount: result.mapCount, quarantineCount: result.quarantineCount, productionImport: result.productionImport }, { candidateCount: 2, mapCount: 1, quarantineCount: 1, productionImport: "HOLD" });
  assert.match(result.resolutionSha256, /^[0-9a-f]{64}$/u);
});

test("T5 identity resolution package rejects partial, stale and auto-created candidate decisions", () => {
  writeDecision(packageFor([{ profileSourceIdentitySha256: hash("profile:0"), targetPersonSourceIdentitySha256: hash("person:approved-a"), disposition: "map", reasonCode: "T5_IDENTITY_REVIEWED_EXACT_T0" }]));
  assert.throws(() => verifyT5IdentityResolutionPackage({ stagePath: stage, decisionPath: decision }), /candidate coverage/u);
  writeDecision({ ...packageFor([]), sourceBusinessSha256: hash("stale") });
  assert.throws(() => verifyT5IdentityResolutionPackage({ stagePath: stage, decisionPath: decision }), /package binding/u);
  writeDecision(packageFor([{ profileSourceIdentitySha256: hash("profile:0"), targetPersonSourceIdentitySha256: null, disposition: "map", reasonCode: "T5_IDENTITY_REVIEWED_EXACT_T0" }, { profileSourceIdentitySha256: hash("profile:1"), targetPersonSourceIdentitySha256: null, disposition: "quarantine", reasonCode: "T5_IDENTITY_REVIEWED_DEFERRED" }]));
  assert.throws(() => verifyT5IdentityResolutionPackage({ stagePath: stage, decisionPath: decision }), /decision target/u);
});
