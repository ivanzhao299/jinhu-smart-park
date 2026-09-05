#!/usr/bin/env node
/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  admitFrozenCompatibilityItems,
  buildFrozenCompatibilityMigrationManifest,
  FrozenCompatibilityMigrationManifestError,
  validateFrozenCompatibilityMigrationManifest,
} from "../hr-cutover/legacy-frozen-compatibility-migration-manifest.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-frozen-compatibility-migration-manifest-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const build = value => buildFrozenCompatibilityMigrationManifest({ contract: value ?? contract(), repositoryRoot: root });
const rejects = (code, action) => assert.throws(
  action,
  error => error instanceof FrozenCompatibilityMigrationManifestError && error.code === code,
);

test("current M5 manifest is NOT_READY and admits no compatibility item", () => {
  const manifest = build();
  assert.equal(manifest.status, "NOT_READY");
  assert.equal(manifest.productionImport, "HOLD");
  assert.deepEqual(manifest.milestoneGates.map(row => [row.stableId, row.status, row.count]), [
    ["M0", "NOT_FROZEN", 0],
    ["M1", "NOT_FROZEN", 0],
    ["M2", "NOT_FROZEN", 0],
    ["M3", "NOT_FROZEN", 0],
    ["M4", "NOT_FROZEN", 0],
  ]);
  assert.deepEqual(manifest.admittedItems, []);
  assert.deepEqual(validateFrozenCompatibilityMigrationManifest(manifest, { contract: contract(), repositoryRoot: root }), manifest);
});

test("all source denominators remain locked including empty and unobserved objects", () => {
  const manifest = build();
  assert.deepEqual(Object.fromEntries(manifest.denominators.map(row => [row.stableId, row.count])), {
    CLIENT_FIELDS: 2364,
    CLIENT_ROUTINES: 212,
    CLIENT_MENU_ENTRIES: 68,
    GROUP_WEB_TABLES: 438,
    GROUP_WEB_FIELDS: 5449,
    GROUP_WEB_VIEWS: 768,
    GROUP_WEB_ROUTINES: 428,
    GROUP_WEB_ASP_PAGES: 4026,
    GROUP_WEB_NAVIGABLE_ENTRIES: 186,
    PRODUCTION_GATES: 8,
  });
  assert.ok(manifest.denominators.every(row => row.status === "DENOMINATOR_LOCKED"));
  assert.equal(manifest.evidenceBindings.some(row => row.stableId === "PAGE_CLIENT_MENU_INVENTORY"), true);
  assert.equal(manifest.evidenceBindings.some(row => row.stableId === "FIELD_KNOWHOW"), true);
  const input = contract();
  assert.equal(input.denominatorPolicy.includeEmptySourceObjects, true);
  assert.equal(input.denominatorPolicy.includeEmptyTables, true);
  assert.equal(input.denominatorPolicy.includeNullOnlyOrEmptyFields, true);
  assert.equal(input.denominatorPolicy.includeUncalledRoutines, true);
  assert.equal(input.denominatorPolicy.includeUnnavigatedPages, true);
});

test("only fully reviewed routines are exposed as frozen candidates, never as admitted", () => {
  const manifest = build();
  assert.deepEqual(manifest.frozenItems.map(row => [row.stableId, row.status, row.count]), [
    ["RULE-06D838A8343E39F6", "FROZEN", 1],
    ["RULE-0F16F0ADB333445C", "FROZEN", 1],
    ["RULE-69093173CCAE1126", "FROZEN", 1],
    ["RULE-A490C8F10B0BB6DC", "FROZEN", 1],
    ["RULE-A6D7E11BA9DEAEC2", "FROZEN", 1],
    ["RULE-EEE0816A27D9E126", "FROZEN", 1],
  ]);
  assert.deepEqual(manifest.coverageCounts.map(row => [row.stableId, row.status, row.count]), [
    ["FIELD_FROZEN", "NOT_FROZEN", 0],
    ["ROUTINE_FROZEN", "PARTIAL", 6],
    ["PAGE_FROZEN", "NOT_FROZEN", 0],
    ["PRODUCTION_FROZEN", "NOT_FROZEN", 0],
  ]);
  assert.deepEqual(manifest.admittedItems, []);
});

test("admission helper passes only exact FROZEN stable identities after an independent ready gate", () => {
  const frozen = [{ stableId: "RULE-TEST-001", status: "FROZEN", evidenceSha256: "a".repeat(64), count: 1 }];
  assert.deepEqual(admitFrozenCompatibilityItems(frozen, false), []);
  assert.deepEqual(admitFrozenCompatibilityItems(frozen, true), frozen);
  const nonFrozen = [{ ...frozen[0], status: "VERIFIED" }];
  rejects("FROZEN_MANIFEST_ADMISSION_INPUT_INVALID", () => admitFrozenCompatibilityItems(nonFrozen, true));
  const duplicate = [...frozen, structuredClone(frozen[0])];
  rejects("FROZEN_MANIFEST_ADMISSION_INPUT_INVALID", () => admitFrozenCompatibilityItems(duplicate, true));
});

test("partial milestone hashes cannot bypass incomplete progress, roadmap, or production evidence", () => {
  const input = contract();
  input.milestonePolicy.currentFrozenEvidence = [
    { stableId: "M0", status: "FROZEN", evidenceSha256: "a".repeat(64) },
  ];
  const manifest = build(input);
  assert.equal(manifest.milestoneGates[0].status, "FROZEN");
  assert.ok(manifest.milestoneGates.slice(1).every(row => row.status === "NOT_FROZEN"));
  assert.equal(manifest.status, "NOT_READY");
  assert.deepEqual(manifest.admittedItems, []);
  assert.equal(manifest.productionImport, "HOLD");
});

test("loader, A/B, and production write remain structurally unreachable", () => {
  const manifest = build();
  assert.deepEqual(manifest.operationGates.map(row => [row.stableId, row.status, row.count]), [
    ["LOAD", "FORBIDDEN", 0],
    ["A_B", "FORBIDDEN", 0],
    ["PRODUCTION_WRITE", "FORBIDDEN", 0],
  ]);
  const source = readFileSync(resolve(root, "scripts/hr-cutover/legacy-frozen-compatibility-migration-manifest.mjs"), "utf8");
  assert.doesNotMatch(source, /node:child_process|spawnSync|execFile|production-import-writer|run-final-rehearsal|run-core-t0/u);
});

test("manifest output contains stable identities, statuses, hashes, and counts but no paths or source values", () => {
  const manifest = build();
  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(serialized, /"(?:path|sourceTable|sourceColumn|legacyObject|currentTarget|employeeId|personKey|payrollValue|salaryValue)"\s*:/iu);
  assert.match(manifest.contractSha256, /^[0-9a-f]{64}$/u);
  assert.match(manifest.manifestSha256, /^[0-9a-f]{64}$/u);
  assert.equal(manifest.evidenceBindings.length, contract().evidenceLedgers.length);
  assert.ok(manifest.evidenceBindings.every(row => row.status === "BOUND" && row.count === 1 && /^[0-9a-f]{64}$/u.test(row.evidenceSha256)));
});

test("evidence hash drift and unsafe policy mutations fail closed", () => {
  const drifted = contract();
  drifted.evidenceLedgers[0].sha256 = "0".repeat(64);
  rejects("FROZEN_MANIFEST_EVIDENCE_DRIFT", () => build(drifted));

  const performanceRuntimeDrift = contract();
  performanceRuntimeDrift.evidenceLedgers.find(row => row.stableId === "PERFORMANCE_RUNTIME_COVERAGE").sha256 = "0".repeat(64);
  rejects("FROZEN_MANIFEST_EVIDENCE_DRIFT", () => build(performanceRuntimeDrift));

  const missingPrintRoutine = contract();
  missingPrintRoutine.evidenceLedgers = missingPrintRoutine.evidenceLedgers.filter(
    row => row.stableId !== "ROUTINE_PERFORMANCE_CALCULATION_PRINT",
  );
  rejects("FROZEN_MANIFEST_CONTRACT_INVALID", () => build(missingPrintRoutine));

  const shrunk = contract();
  shrunk.expectedDenominators.CLIENT_FIELDS -= 1;
  rejects("FROZEN_MANIFEST_CONTRACT_INVALID", () => build(shrunk));

  const excludesEmpty = contract();
  excludesEmpty.denominatorPolicy.includeEmptySourceObjects = false;
  rejects("FROZEN_MANIFEST_CONTRACT_INVALID", () => build(excludesEmpty));

  const opensWriter = contract();
  opensWriter.admissionPolicy.productionWriterInvocation = "ALLOWED";
  rejects("FROZEN_MANIFEST_CONTRACT_INVALID", () => build(opensWriter));
});

test("invalid or duplicate milestone attestations fail before manifest construction", () => {
  const invalidHash = contract();
  invalidHash.milestonePolicy.currentFrozenEvidence = [
    { stableId: "M0", status: "FROZEN", evidenceSha256: "not-a-hash" },
  ];
  rejects("FROZEN_MANIFEST_CONTRACT_INVALID", () => build(invalidHash));

  const duplicate = contract();
  duplicate.milestonePolicy.currentFrozenEvidence = [
    { stableId: "M0", status: "FROZEN", evidenceSha256: "a".repeat(64) },
    { stableId: "M0", status: "FROZEN", evidenceSha256: "b".repeat(64) },
  ];
  rejects("FROZEN_MANIFEST_CONTRACT_INVALID", () => build(duplicate));
});

test("canonical hash rejects status or admission tampering", () => {
  const manifest = build();
  manifest.status = "READY";
  rejects("FROZEN_MANIFEST_HASH_MISMATCH", () => validateFrozenCompatibilityMigrationManifest(manifest, { contract: contract(), repositoryRoot: root }));
});
