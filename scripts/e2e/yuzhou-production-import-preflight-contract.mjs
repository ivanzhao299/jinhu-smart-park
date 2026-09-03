#!/usr/bin/env node
/* global Buffer, process */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  computeProductionImportPlanningContractHash,
  evaluateProductionImportPreflight,
} from "../hr-cutover/production-import-preflight.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const FINAL_PAIR_CONTRACT = JSON.parse(readFileSync(resolve(ROOT, "scripts/hr-cutover/contracts/final-rehearsal-pair-v1.json"), "utf8"));
const NOW = new Date("2026-08-29T01:00:00.000Z");
const TRIPLE = {
  codeSha: "a".repeat(40),
  sourceSnapshotHash: "b".repeat(64),
  mappingContractHash: "c".repeat(64),
};
const TARGET = {
  environment: "production",
  alias: "jinhu-smart-park-production",
  identitySha256: "d".repeat(64),
};
const OPERATION_ID = "yzprod-import-20260829T000000Z-abcdef123456";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function writeArtifact(root, role, value) {
  const relativePath = `${role}.json`;
  const bytes = jsonBytes(value);
  writeFileSync(join(root, relativePath), bytes, { mode: 0o600 });
  chmodSync(join(root, relativePath), 0o600);
  return { role, relativePath, sha256: hash(bytes) };
}

function validAllowlist(target = TARGET) {
  return {
    formatVersion: 1,
    contractKind: "yuzhou_hr_production_import_target_allowlist",
    status: "PASS",
    allowedTargets: [{ ...target }],
    reasonCodes: [],
  };
}

function makeFixture() {
  const sandbox = mkdtempSync(join(tmpdir(), "yuzhou-production-import-preflight-"));
  chmodSync(sandbox, 0o700);
  const artifacts = [];
  const declarations = new Map();
  const add = (role, value) => {
    const declaration = writeArtifact(sandbox, role, value);
    artifacts.push(declaration);
    declarations.set(role, declaration);
    return declaration;
  };
  const beforeAndMaps = new Map();
  for (const [index, phase] of ["T0", "T1", "T2", "T3"].entries()) {
    const before = add(`before_image_${phase}`, {
      formatVersion: 1,
      artifactKind: "yuzhou_hr_production_before_image",
      phase,
      targetIdentitySha256: TARGET.identitySha256,
      canonicalSha256: String(index + 1).repeat(64),
      tableLedgerSha256: String(index + 5).repeat(64),
      rowCount: index,
      createdAt: "2026-08-28T23:00:00.000Z",
      productionImport: "HOLD",
    });
    const recordMap = add(`legacy_record_map_${phase}`, {
      formatVersion: 1,
      artifactKind: "yuzhou_hr_production_legacy_record_map_snapshot",
      phase,
      targetIdentitySha256: TARGET.identitySha256,
      activeMapSha256: String(index + 1).repeat(64),
      sourceIdentityLedgerSha256: String(index + 5).repeat(64),
      rowCount: index,
      exactSourceIdentity: true,
      createdAt: "2026-08-28T23:00:00.000Z",
      productionImport: "HOLD",
    });
    beforeAndMaps.set(phase, { before, recordMap });
  }
  const pair = {
    formatVersion: 1,
    status: "PASS",
    contractSha256: hash(jsonBytes(FINAL_PAIR_CONTRACT)),
    triple: TRIPLE,
    rehearsals: ["A", "B"].map(rehearsal => ({ rehearsal, manifestSha256: rehearsal.toLowerCase().repeat(64), cleanupAuditSha256: rehearsal === "A" ? "2".repeat(64) : "3".repeat(64), residualCount: 0 })),
    sourceFacts: FINAL_PAIR_CONTRACT.sourceFacts,
    humanUat: "HOLD",
    productionImport: "HOLD",
  };
  const pairDeclaration = add("final_rehearsal_pair", pair);
  const conflictLedgerDeclaration = add("conflict_decision_ledger", {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_production_conflict_decision_ledger",
    operationId: OPERATION_ID,
    targetIdentitySha256: TARGET.identitySha256,
    entries: [],
    productionImport: "HOLD",
  });
  const manifest = {
    formatVersion: 1,
    manifestKind: "yuzhou_hr_production_import_manifest",
    operationId: OPERATION_ID,
    sourceSurface: "yuzhou_v10_client_database",
    triple: TRIPLE,
    targetIdentitySha256: TARGET.identitySha256,
    conflictDecisionLedgerSha256: conflictLedgerDeclaration.sha256,
    phaseOrder: ["T0", "T1", "T2", "T3"],
    phases: ["T0", "T1", "T2", "T3"].map((phase, index) => ({
      phase,
      sourceBatchManifestSha256: String(index + 1).repeat(64),
      beforeImageSha256: beforeAndMaps.get(phase).before.sha256,
      legacyRecordMapSha256: beforeAndMaps.get(phase).recordMap.sha256,
      existingRecordStrategy: "quarantine",
      existingConflictCount: 0,
      conflictDecisions: [],
    })),
    optionalT5A: { phase: "T5A", status: "HOLD", decoupled: true, separateAuthorizationRequired: true, manifestSha256: null },
    identityResolution: {
      sourceIdentity: "stable_source_identity_sha256",
      targetResolution: "legacy_record_map_exact",
      nameMatching: false,
      overwrite: false,
      autoCreateLogin: false,
    },
    rollback: { sequence: ["T3", "T2", "T1", "T5A", "T0"], strategy: "before_image_and_active_record_map_only" },
    invariants: { beforeImageRestorable: true, legacyRecordMapExact: true, beforeAfterCanonicalHash: "EXACT", writesOutsideDeclaredPhases: 0, residualCount: 0 },
    productionImport: "HOLD",
  };
  const manifestDeclaration = add("import_manifest", manifest);
  const authorization = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_production_import_one_time_authorization",
    intent: "production_import",
    operationId: OPERATION_ID,
    status: "APPROVED",
    issuedAt: "2026-08-29T00:30:00.000Z",
    expiresAt: "2026-08-29T01:30:00.000Z",
    binding: {
      triple: TRIPLE,
      targetIdentitySha256: TARGET.identitySha256,
      finalRehearsalPairSha256: pairDeclaration.sha256,
      importManifestSha256: manifestDeclaration.sha256,
      windowStartsAt: "2026-08-29T00:00:00.000Z",
      windowEndsAt: "2026-08-29T02:00:00.000Z",
    },
    approvalSet: ["hr_owner", "data_security_owner", "release_owner"].map((role, index) => ({ role, subjectRefSha256: String(index + 4).repeat(64), signedDecisionSha256: String(index + 7).repeat(64) })),
    authorizationNonceSha256: "e".repeat(64),
    restoreAuthorityArtifactAccepted: false,
    secretDelivery: "OUT_OF_BAND_REQUIRED",
    productionImport: "HOLD",
  };
  const authDeclaration = add("one_time_import_authorization", authorization);
  add("authorization_usage_ledger", { formatVersion: 1, artifactKind: "yuzhou_hr_production_authorization_usage_ledger", entries: [] });
  const plan = {
    formatVersion: 1,
    planKind: "yuzhou_hr_production_import_preflight_plan",
    operationId: OPERATION_ID,
    mode: "DRY_RUN",
    sourceSurface: "yuzhou_v10_client_database",
    triple: TRIPLE,
    planningContractSha256: computeProductionImportPlanningContractHash(),
    target: TARGET,
    window: { startsAt: "2026-08-29T00:00:00.000Z", endsAt: "2026-08-29T02:00:00.000Z" },
    artifacts,
    authorityBoundary: { acceptedIntent: "production_import", restoreAuthorizationAccepted: false, secretDelivery: "OUT_OF_BAND_REQUIRED", executionAvailable: false },
    productionImport: "HOLD",
  };
  const options = { evidenceRoot: sandbox, allowlist: validAllowlist(), currentCodeSha: TRIPLE.codeSha, mergedCodeSha: TRIPLE.codeSha, now: NOW };
  return { sandbox, plan, options, declarations, manifest, authorization, authDeclaration };
}

function rewriteRole(fixture, role, mutate) {
  const declaration = fixture.plan.artifacts.find(row => row.role === role);
  const path = join(fixture.sandbox, declaration.relativePath);
  const value = JSON.parse(readFileSync(path, "utf8"));
  mutate(value);
  const bytes = jsonBytes(value);
  writeFileSync(path, bytes, { mode: 0o600 });
  chmodSync(path, 0o600);
  declaration.sha256 = hash(bytes);
  return declaration;
}

function reason(fixture) {
  return evaluateProductionImportPreflight(fixture.plan, fixture.options).reasonCodes.find(code => code !== "PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE");
}

function bindSignedConflict(fixture, { strategy = "merge", signerRole = "hr_owner" } = {}) {
  const manifestDeclaration = fixture.plan.artifacts.find(row => row.role === "import_manifest");
  const manifestValue = JSON.parse(readFileSync(join(fixture.sandbox, manifestDeclaration.relativePath), "utf8"));
  const phase = manifestValue.phases[0];
  const decision = {
    sourceIdentitySha256: "1".repeat(64),
    strategy,
    existingTargetIdentitySha256: "2".repeat(64),
    beforeImageSha256: phase.beforeImageSha256,
    legacyRecordMapSha256: phase.legacyRecordMapSha256,
    decisionAttestationSha256: "5".repeat(64),
  };
  const ledger = rewriteRole(fixture, "conflict_decision_ledger", value => value.entries.push({
    phase: "T0",
    ...decision,
    signerRole,
    attestedAt: "2026-08-29T00:20:00.000Z",
  }));
  const manifest = rewriteRole(fixture, "import_manifest", value => {
    value.conflictDecisionLedgerSha256 = ledger.sha256;
    value.phases[0].existingRecordStrategy = strategy;
    value.phases[0].existingConflictCount = 1;
    value.phases[0].conflictDecisions = [decision];
  });
  rewriteRole(fixture, "one_time_import_authorization", value => { value.binding.importManifestSha256 = manifest.sha256; });
}

test("complete preflight can pass engineering checks but execution remains unreachable and HOLD", () => {
  const fixture = makeFixture();
  try {
    const result = evaluateProductionImportPreflight(fixture.plan, fixture.options);
    assert.deepEqual(result, {
      formatVersion: 1,
      status: "HOLD",
      engineeringPreflight: "PASS",
      reasonCodes: ["PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE"],
      operationId: OPERATION_ID,
      firstWave: ["T0", "T1", "T2", "T3"],
      optionalT5A: "HOLD",
      productionImport: "HOLD",
      executionReachable: false,
    });
  } finally { rmSync(fixture.sandbox, { recursive: true, force: true }); }
});

test("a detached conflict ledger can authorize an explicit merge without enabling execution", () => {
  const fixture = makeFixture();
  try {
    bindSignedConflict(fixture);
    const result = evaluateProductionImportPreflight(fixture.plan, fixture.options);
    assert.equal(result.engineeringPreflight, "PASS");
    assert.deepEqual(result.reasonCodes, ["PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE"]);
    assert.equal(result.executionReachable, false);
  } finally { rmSync(fixture.sandbox, { recursive: true, force: true }); }
});

test("missing, stale, reused and restore authorization artifacts fail closed", () => {
  const cases = [
    ["missing", fixture => { fixture.plan.artifacts = fixture.plan.artifacts.filter(row => row.role !== "one_time_import_authorization"); }, "PRODUCTION_IMPORT_AUTH_MISSING"],
    ["stale", fixture => rewriteRole(fixture, "one_time_import_authorization", value => { value.expiresAt = "2026-08-29T00:59:59.000Z"; }), "PRODUCTION_IMPORT_AUTH_STALE"],
    ["reused", fixture => rewriteRole(fixture, "authorization_usage_ledger", value => value.entries.push({ operationId: "yzprod-import-20260828T000000Z-123456abcdef", authorizationArtifactSha256: fixture.authDeclaration.sha256, authorizationNonceSha256: "0".repeat(64), intent: "production_import", status: "CONSUMED", consumedAt: "2026-08-28T01:00:00.000Z" })), "PRODUCTION_IMPORT_AUTH_REUSED"],
    ["operation-reused", fixture => rewriteRole(fixture, "authorization_usage_ledger", value => value.entries.push({ operationId: OPERATION_ID, authorizationArtifactSha256: "f".repeat(64), authorizationNonceSha256: "0".repeat(64), intent: "production_import", status: "CONSUMED", consumedAt: "2026-08-28T01:00:00.000Z" })), "PRODUCTION_IMPORT_OPERATION_REUSED"],
    ["restore-intent", fixture => rewriteRole(fixture, "one_time_import_authorization", value => { value.intent = "production_restore"; }), "PRODUCTION_IMPORT_AUTH_WRONG_INTENT"],
  ];
  for (const [label, mutate, expected] of cases) {
    const fixture = makeFixture();
    try { mutate(fixture); assert.equal(reason(fixture), expected, label); }
    finally { rmSync(fixture.sandbox, { recursive: true, force: true }); }
  }
});

test("wrong current SHA, manifest SHA bindings, target and source surface fail closed", () => {
  const cases = [
    ["current SHA", fixture => { fixture.options.currentCodeSha = "f".repeat(40); }, "PRODUCTION_IMPORT_CURRENT_CODE_SHA_MISMATCH"],
    ["manifest code SHA", fixture => rewriteRole(fixture, "import_manifest", value => { value.triple.codeSha = "f".repeat(40); }), "PRODUCTION_IMPORT_CODE_SHA_MISMATCH"],
    ["source snapshot", fixture => rewriteRole(fixture, "import_manifest", value => { value.triple.sourceSnapshotHash = "f".repeat(64); }), "PRODUCTION_IMPORT_SOURCE_SNAPSHOT_MISMATCH"],
    ["mapping contract", fixture => rewriteRole(fixture, "import_manifest", value => { value.triple.mappingContractHash = "f".repeat(64); }), "PRODUCTION_IMPORT_MAPPING_CONTRACT_MISMATCH"],
    ["wrong target", fixture => rewriteRole(fixture, "import_manifest", value => { value.targetIdentitySha256 = "f".repeat(64); }), "PRODUCTION_IMPORT_TARGET_MISMATCH"],
    ["cross surface", fixture => rewriteRole(fixture, "import_manifest", value => { value.sourceSurface = "group_web"; }), "PRODUCTION_IMPORT_SOURCE_SURFACE_INVALID"],
  ];
  for (const [label, mutate, expected] of cases) {
    const fixture = makeFixture();
    try { mutate(fixture); assert.equal(reason(fixture), expected, label); }
    finally { rmSync(fixture.sandbox, { recursive: true, force: true }); }
  }
});

test("the A/B artifact must bind the real final-pair contract and frozen source facts", () => {
  const cases = [
    ["contract hash", value => { value.contractSha256 = "f".repeat(64); }],
    ["source facts", value => { value.sourceFacts.T4.headers += 1; }],
    ["reused manifests", value => { value.rehearsals[1].manifestSha256 = value.rehearsals[0].manifestSha256; }],
    ["reused cleanup", value => { value.rehearsals[1].cleanupAuditSha256 = value.rehearsals[0].cleanupAuditSha256; }],
  ];
  for (const [label, mutate] of cases) {
    const fixture = makeFixture();
    try {
      rewriteRole(fixture, "final_rehearsal_pair", mutate);
      assert.equal(reason(fixture), "PRODUCTION_IMPORT_AB_EVIDENCE_INVALID", label);
    } finally { rmSync(fixture.sandbox, { recursive: true, force: true }); }
  }
});

test("target allowlist, time window and artifact controls fail before any execution", () => {
  const cases = [
    ["not allowlisted", fixture => { fixture.options.allowlist = validAllowlist({ ...TARGET, identitySha256: "f".repeat(64) }); }, "PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED"],
    ["ambiguous alias", fixture => { fixture.options.allowlist.allowedTargets.push({ ...TARGET, identitySha256: "f".repeat(64) }); }, "PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED"],
    ["ambiguous identity", fixture => { fixture.options.allowlist.allowedTargets.push({ ...TARGET, alias: "jinhu-smart-park-secondary" }); }, "PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED"],
    ["future window", fixture => { fixture.options.now = new Date("2026-08-28T23:59:59.000Z"); }, "PRODUCTION_IMPORT_WINDOW_NOT_OPEN"],
    ["window end is exclusive", fixture => { fixture.options.now = new Date("2026-08-29T02:00:00.000Z"); }, "PRODUCTION_IMPORT_WINDOW_EXPIRED"],
    ["expired window", fixture => { fixture.options.now = new Date("2026-08-29T02:00:01.000Z"); }, "PRODUCTION_IMPORT_WINDOW_EXPIRED"],
    ["hash drift", fixture => { const row = fixture.plan.artifacts.find(item => item.role === "before_image_T0"); writeFileSync(join(fixture.sandbox, row.relativePath), "{}\n", { mode: 0o600 }); }, "PRODUCTION_IMPORT_ARTIFACT_HASH_MISMATCH"],
    ["unsafe mode", fixture => { const row = fixture.plan.artifacts.find(item => item.role === "before_image_T0"); chmodSync(join(fixture.sandbox, row.relativePath), 0o640); }, "PRODUCTION_IMPORT_ARTIFACT_UNSAFE"],
    ["missing before image", fixture => { fixture.plan.artifacts = fixture.plan.artifacts.filter(row => row.role !== "before_image_T2"); }, "PRODUCTION_IMPORT_BEFORE_IMAGE_MISSING"],
    ["missing record map", fixture => { fixture.plan.artifacts = fixture.plan.artifacts.filter(row => row.role !== "legacy_record_map_T2"); }, "PRODUCTION_IMPORT_RECORD_MAP_MISSING"],
    ["planning contract drift", fixture => { fixture.plan.planningContractSha256 = "f".repeat(64); }, "PRODUCTION_IMPORT_PLANNING_CONTRACT_MISMATCH"],
    ["PII in artifact path", fixture => { fixture.plan.artifacts[0].relativePath = "artifact-13800000000.json"; }, "PRODUCTION_IMPORT_ARTIFACT_INVALID"],
  ];
  for (const [label, mutate, expected] of cases) {
    const fixture = makeFixture();
    try { mutate(fixture); assert.equal(reason(fixture), expected, label); }
    finally { rmSync(fixture.sandbox, { recursive: true, force: true }); }
  }
  const fixture = makeFixture();
  try {
    const declaration = fixture.plan.artifacts.find(row => row.role === "before_image_T0");
    const original = join(fixture.sandbox, declaration.relativePath);
    const outside = join(tmpdir(), `outside-${Date.now()}.json`);
    writeFileSync(outside, readFileSync(original), { mode: 0o600 });
    rmSync(original);
    symlinkSync(outside, original);
    assert.equal(reason(fixture), "PRODUCTION_IMPORT_ARTIFACT_UNSAFE");
    rmSync(outside, { force: true });
  } finally { rmSync(fixture.sandbox, { recursive: true, force: true }); }
});

test("authorization lifetime is current, exclusive at expiry, and contained by the pinned window", () => {
  const cases = [
    ["exact expiry", fixture => { fixture.options.now = new Date("2026-08-29T01:30:00.000Z"); }, "PRODUCTION_IMPORT_AUTH_STALE"],
    ["issued before window", fixture => rewriteRole(fixture, "one_time_import_authorization", value => { value.issuedAt = "2026-08-28T23:59:59.000Z"; }), "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH"],
    ["expires after window", fixture => rewriteRole(fixture, "one_time_import_authorization", value => { value.expiresAt = "2026-08-29T02:00:01.000Z"; }), "PRODUCTION_IMPORT_AUTH_BINDING_MISMATCH"],
  ];
  for (const [label, mutate, expected] of cases) {
    const fixture = makeFixture();
    try { mutate(fixture); assert.equal(reason(fixture), expected, label); }
    finally { rmSync(fixture.sandbox, { recursive: true, force: true }); }
  }
});

test("conflicts require explicit allowed strategies and detached decisions", () => {
  const cases = [
    ["unsigned", value => { value.phases[0].existingConflictCount = 1; value.phases[0].conflictDecisions = [{ sourceIdentitySha256: "1".repeat(64), strategy: "merge", existingTargetIdentitySha256: "2".repeat(64), beforeImageSha256: "3".repeat(64), legacyRecordMapSha256: "4".repeat(64) }]; }, "PRODUCTION_IMPORT_CONFLICT_UNSIGNED"],
    ["unbound detached hash", value => { value.phases[0].existingConflictCount = 1; value.phases[0].conflictDecisions = [{ sourceIdentitySha256: "1".repeat(64), strategy: "merge", existingTargetIdentitySha256: "2".repeat(64), beforeImageSha256: "3".repeat(64), legacyRecordMapSha256: "4".repeat(64), decisionAttestationSha256: "5".repeat(64) }]; }, "PRODUCTION_IMPORT_CONFLICT_UNSIGNED"],
    ["overwrite strategy", value => { value.phases[0].existingRecordStrategy = "overwrite"; }, "PRODUCTION_IMPORT_OVERWRITE_FORBIDDEN"],
    ["name matching", value => { value.identityResolution.nameMatching = true; }, "PRODUCTION_IMPORT_NAME_MATCH_FORBIDDEN"],
    ["overwrite flag", value => { value.identityResolution.overwrite = true; }, "PRODUCTION_IMPORT_OVERWRITE_FORBIDDEN"],
    ["login creation", value => { value.identityResolution.autoCreateLogin = true; }, "PRODUCTION_IMPORT_LOGIN_CREATION_FORBIDDEN"],
    ["strategy mismatch", value => { value.phases[0].existingConflictCount = 1; value.phases[0].conflictDecisions = [{ sourceIdentitySha256: "1".repeat(64), strategy: "merge", existingTargetIdentitySha256: "2".repeat(64), beforeImageSha256: value.phases[0].beforeImageSha256, legacyRecordMapSha256: value.phases[0].legacyRecordMapSha256, decisionAttestationSha256: "5".repeat(64) }]; }, "PRODUCTION_IMPORT_CONFLICT_UNSIGNED"],
    ["before-image mismatch", value => { value.phases[0].existingConflictCount = 1; value.phases[0].conflictDecisions = [{ sourceIdentitySha256: "1".repeat(64), strategy: "quarantine", existingTargetIdentitySha256: "2".repeat(64), beforeImageSha256: "f".repeat(64), legacyRecordMapSha256: value.phases[0].legacyRecordMapSha256, decisionAttestationSha256: "5".repeat(64) }]; }, "PRODUCTION_IMPORT_CONFLICT_UNSIGNED"],
  ];
  for (const [label, mutate, expected] of cases) {
    const fixture = makeFixture();
    try { rewriteRole(fixture, "import_manifest", mutate); assert.equal(reason(fixture), expected, label); }
    finally { rmSync(fixture.sandbox, { recursive: true, force: true }); }
  }
  const skipApproval = makeFixture();
  try {
    bindSignedConflict(skipApproval, { strategy: "skip_approved", signerRole: "release_owner" });
    assert.equal(reason(skipApproval), "PRODUCTION_IMPORT_CONFLICT_UNSIGNED", "skip_approved requires HR owner");
  } finally { rmSync(skipApproval.sandbox, { recursive: true, force: true }); }
});

test("usage replay includes nonce identity and approval roles must be independent", () => {
  const replay = makeFixture();
  try {
    rewriteRole(replay, "authorization_usage_ledger", value => value.entries.push({
      operationId: "yzprod-import-20260828T000000Z-123456abcdef",
      authorizationArtifactSha256: "f".repeat(64),
      authorizationNonceSha256: replay.authorization.authorizationNonceSha256,
      intent: "production_import",
      status: "CONSUMED",
      consumedAt: "2026-08-28T01:00:00.000Z",
    }));
    assert.equal(reason(replay), "PRODUCTION_IMPORT_AUTH_REUSED");
  } finally { rmSync(replay.sandbox, { recursive: true, force: true }); }
  const approvals = makeFixture();
  try {
    rewriteRole(approvals, "one_time_import_authorization", value => {
      value.approvalSet[1].signedDecisionSha256 = value.approvalSet[0].signedDecisionSha256;
    });
    assert.equal(reason(approvals), "PRODUCTION_IMPORT_AUTH_MISSING");
  } finally { rmSync(approvals.sandbox, { recursive: true, force: true }); }
});

test("T5A, rollback and residual invariants cannot be weakened", () => {
  const cases = [
    ["coupled T5A", value => { value.optionalT5A.status = "READY"; value.optionalT5A.decoupled = false; }, "PRODUCTION_IMPORT_T5A_NOT_DECOUPLED"],
    ["rollback order", value => { value.rollback.sequence = ["T3", "T2", "T1", "T0", "T5A"]; }, "PRODUCTION_IMPORT_ROLLBACK_PLAN_INVALID"],
    ["residual", value => { value.invariants.residualCount = 1; }, "PRODUCTION_IMPORT_RESIDUAL_INVARIANT_INVALID"],
    ["hash invariant", value => { value.invariants.beforeAfterCanonicalHash = "BEST_EFFORT"; }, "PRODUCTION_IMPORT_RESIDUAL_INVARIANT_INVALID"],
    ["phase order", value => { value.phaseOrder = ["T0", "T2", "T1", "T3"]; }, "PRODUCTION_IMPORT_PHASE_SEQUENCE_INVALID"],
  ];
  for (const [label, mutate, expected] of cases) {
    const fixture = makeFixture();
    try { rewriteRole(fixture, "import_manifest", mutate); assert.equal(reason(fixture), expected, label); }
    finally { rmSync(fixture.sandbox, { recursive: true, force: true }); }
  }
});

test("ordinary deploy/lab code cannot reach the production import preflight boundary", () => {
  const source = readFileSync(resolve(ROOT, "scripts/hr-cutover/production-import-preflight.mjs"), "utf8");
  const deploy = readFileSync(resolve(ROOT, ".github/workflows/deploy-production.yml"), "utf8");
  const lifecycle = readFileSync(resolve(ROOT, "scripts/hr-cutover/full-domain-lifecycle.mjs"), "utf8");
  assert.doesNotMatch(source, /load-yuzhou|psql|pg_restore|docker\s|ALLOW_YUZHOU_MIGRATION|ALLOW_YUZHOU_FINAL_REHEARSAL/u);
  assert.doesNotMatch(source, /node:child_process|execFile|spawn(?:Sync)?\s*\(/u);
  assert.doesNotMatch(source, /writeFile|appendFile|mkdir|createWriteStream|openSync|rename|unlink|rmSync/u);
  assert.deepEqual([...new Set([...source.matchAll(/from "node:([^"/]+)"/gu)].map(match => match[1]))].sort(), ["crypto", "fs", "path", "url"]);
  assert.doesNotMatch(deploy, /production-import-preflight|yuzhou_hr_production_import|PRODUCTION_IMPORT_AUTH/u);
  assert.doesNotMatch(lifecycle, /production-import-preflight|yuzhou_hr_production_import|PRODUCTION_IMPORT_AUTH/u);
  const execute = spawnSync(process.execPath, [resolve(ROOT, "scripts/hr-cutover/production-import-preflight.mjs"), "--execute"], { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(execute.status, 0);
  const result = JSON.parse(execute.stdout.trim());
  assert.equal(result.productionImport, "HOLD");
  assert.equal(result.executionReachable, false);
  assert(result.reasonCodes.includes("PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE"));
});

test("schema keeps execution unavailable while the reviewed default allowlist remains a single exact target", () => {
  const schema = JSON.parse(readFileSync(resolve(ROOT, "scripts/hr-cutover/contracts/production-import-plan.schema.json"), "utf8"));
  const allowlist = JSON.parse(readFileSync(resolve(ROOT, "scripts/hr-cutover/contracts/production-import-target-allowlist-v1.json"), "utf8"));
  assert.equal(schema.properties.mode.const, "DRY_RUN");
  assert.equal(schema.properties.productionImport.const, "HOLD");
  assert.equal(schema.properties.authorityBoundary.properties.executionAvailable.const, false);
  assert.equal(allowlist.status, "PASS");
  assert.deepEqual(allowlist.allowedTargets, [{
    environment: "production",
    alias: "jinhu-smart-park-production",
    identitySha256: "06ac3572434dbef9bde1c46e448906c4e86fbee28b36d8a4020ac15fa24a6f13",
  }]);
  assert.deepEqual(allowlist.reasonCodes, []);
});
