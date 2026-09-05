import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
  ProductionImportEntrypointError,
  createProductionImportArtifactCryptoProvider,
  parseProductionImportEntrypointArgs,
  readBoundedPrivateArtifactBytes,
  runProductionImportEntrypoint,
} from "../hr-cutover/execute-production-import.mjs";
import {
  decryptProductionImportEnvelope,
  encryptProductionImportEnvelope,
} from "../hr-cutover/production-import-crypto-provider.mjs";
import {
  DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT,
  computeProductionImportPayloadBundleHash,
  computeProductionImportPayloadHash,
  computeSealedProductionImportPlanHash,
  computeProductionImportTargetScopeHash,
} from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { computeProductionImportTargetCanonicalHash } from "../hr-cutover/production-import-target-model.mjs";

const roots = [];
const H = value => createHash("sha256").update(value).digest("hex");
const CODE_SHA = "a".repeat(40);
const NOW = new Date("2026-09-05T01:00:00.000Z");
const TARGET_SCOPE = {
  tenantId: "tenant-fixture",
  parkId: "park-fixture",
  scopeSha256: computeProductionImportTargetScopeHash({ tenantId: "tenant-fixture", parkId: "park-fixture" }),
};

afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
});

function privateJson(root, name, value) {
  const path = join(root, name);
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  writeFileSync(path, bytes, { mode: 0o600 });
  chmodSync(path, 0o600);
  return { path, sha256: H(bytes) };
}

function privateBytes(root, name, bytes) {
  const path = join(root, name);
  writeFileSync(path, bytes, { mode: 0o600 });
  chmodSync(path, 0o600);
  return { path, sha256: H(bytes) };
}

function fixture({ intent = "HOLD", domains = ["T0", "T1", "T2", "T3"], withExecution = false, deploymentMode = "smart_park_integrated" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "jinhu-prod-import-entrypoint-"));
  roots.push(root);
  const phases = ["T0", "T1", "T2", "T3"].map((phase, ordinal) => {
    const sourceBatchManifestSha256 = H(`${phase}:manifest`);
    const bundle = {
      formatVersion: 2,
      artifactKind: "yuzhou_hr_production_import_payload_bundle",
      phase,
      targetScope: TARGET_SCOPE,
      canonicalizationVersion: DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.canonicalizationVersion,
      sourceBatchManifestSha256,
      records: [],
    };
    const descriptor = privateJson(root, `${phase}.json`, bundle);
    return {
      descriptor,
      plan: {
        phase,
        ordinal,
        sourceBatchManifestSha256,
        payloadBundleArtifactSha256: descriptor.sha256,
        payloadBundleSha256: computeProductionImportPayloadBundleHash(bundle),
        canonicalizationVersion: bundle.canonicalizationVersion,
        beforeCanonicalSha256: H(`${phase}:before`),
        expectedAfterCanonicalSha256: H(`${phase}:after`),
        records: [],
      },
    };
  });
  const triple = { codeSha: CODE_SHA, sourceSnapshotHash: H("source"), mappingContractHash: H("mapping") };
  const target = { environment: "production", alias: "fixture-target", identitySha256: H("target") };
  const plan = {
    formatVersion: 2,
    planKind: "yuzhou_hr_production_import_sealed_execution_plan",
    operationId: "yzprod-import-20260905T010000Z-abcdef123456",
    intent: "production_import",
    status: "SEALED",
    triple,
    target,
    targetScope: TARGET_SCOPE,
    window: { startsAt: "2026-09-05T00:00:00.000Z", endsAt: "2026-09-05T02:00:00.000Z" },
    authorization: {
      intent: "production_import",
      artifactSha256: H("authorization"),
      nonceSha256: H("nonce"),
      issuedAt: "2026-09-05T00:55:00.000Z",
      expiresAt: "2026-09-05T01:30:00.000Z",
      binding: {
        triple,
        targetIdentitySha256: target.identitySha256,
        targetScopeSha256: TARGET_SCOPE.scopeSha256,
        finalRehearsalPairSha256: H("pair"),
        manifestSha256: H("manifest"),
        windowStartsAt: "2026-09-05T00:00:00.000Z",
        windowEndsAt: "2026-09-05T02:00:00.000Z",
      },
      approvalSet: [
        { role: "hr_owner", subjectRefSha256: H("hr-subject"), signedDecisionSha256: H("hr-decision") },
        { role: "data_security_owner", subjectRefSha256: H("security-subject"), signedDecisionSha256: H("security-decision") },
        { role: "release_owner", subjectRefSha256: H("release-subject"), signedDecisionSha256: H("release-decision") },
      ],
    },
    manifestSha256: H("manifest"),
    finalRehearsalPair: {
      artifactSha256: H("pair"),
      triple,
      rehearsals: [
        { rehearsal: "A", manifestSha256: H("rehearsal-a"), cleanupAuditSha256: H("cleanup-a"), residualCount: 0 },
        { rehearsal: "B", manifestSha256: H("rehearsal-b"), cleanupAuditSha256: H("cleanup-b"), residualCount: 0 },
      ],
    },
    phases: phases.map(row => row.plan),
    phaseOrder: ["T0", "T1", "T2", "T3"],
    rollback: { order: ["T3", "T2", "T1", "T0"], insert: "delete_operation_owned_target", merge: "encrypted_before_image_cas_restore", quarantine: "no_target_write", skipApproved: "no_target_write", residualCount: 0, canonicalHash: "EXACT" },
    sealing: { algorithm: "canonical-json-sha256-v1", sealedPlanSha256: H("placeholder") },
    productionImport: "HOLD",
  };
  let binding;
  let runtimeEvidence;
  if (withExecution) {
    binding = {
      database: "fixture_db",
      databaseUser: "fixture_writer",
      targetIdentitySha256: plan.target.identitySha256,
      targetScope: TARGET_SCOPE,
      serverIdentity: { address: "127.0.0.1", port: 5432, databaseOid: "12345" },
    };
    runtimeEvidence = privateJson(root, "runtime.json", {
        formatVersion: 1,
        artifactKind: "yuzhou_hr_production_import_runtime_release_receipt",
        currentCodeSha: CODE_SHA,
        mergedCodeSha: CODE_SHA,
        runtimeCodeSha: CODE_SHA,
        targetIdentitySha256: plan.target.identitySha256,
        targetScopeSha256: plan.targetScope.scopeSha256,
        observedAt: "2026-09-05T00:50:00.000Z",
        expiresAt: "2026-09-05T01:20:00.000Z",
      });
    plan.runtimeReleaseEvidence = {
      artifactSha256: runtimeEvidence.sha256,
      observedAt: "2026-09-05T00:50:00.000Z",
      expiresAt: "2026-09-05T01:20:00.000Z",
    };
    plan.authorization.binding.runtimeReleaseEvidenceBindingSha256 = computeProductionImportPayloadHash(plan.runtimeReleaseEvidence);
  }
  plan.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(plan);
  const artifacts = {
    sealedPlan: privateJson(root, "plan.json", plan),
    payloadBundles: Object.fromEntries(phases.map(row => [row.plan.phase, row.descriptor])),
  };
  const config = {
    formatVersion: 1,
    entrypointKind: "yuzhou_hr_controlled_production_import_entrypoint",
    deploymentMode,
    executionIntent: intent,
    requestedDomains: domains,
    artifacts,
  };
  if (withExecution) {
    config.execution = {
      runtimeEvidence,
      databaseBinding: privateJson(root, "binding.json", {
        formatVersion: 1,
        artifactKind: "yuzhou_hr_production_import_database_binding",
        sealedPlanSha256: plan.sealing.sealedPlanSha256,
        binding,
      }),
      postgresCredentials: privateJson(root, "credentials.json", {
        formatVersion: 1,
        artifactKind: "yuzhou_hr_production_import_postgres_credentials",
        host: "127.0.0.1",
        port: 5432,
        database: binding.database,
        user: binding.databaseUser,
        password: "fixture-password-never-output",
        sslMode: "disable",
      }),
      cryptoEnvelope: privateJson(root, "crypto-envelope.json", {
        formatVersion: 1,
        artifactKind: "yuzhou_hr_production_import_crypto_envelopes",
        operationId: plan.operationId,
        entries: [],
      }),
      cryptoKeyFiles: [],
    };
  }
  return { root, plan, binding, configPath: privateJson(root, "entrypoint.json", config).path };
}

function dependencies(plan, overrides = {}) {
  return {
    now: NOW,
    validatePlan: () => structuredClone(plan),
    ...overrides,
  };
}

test("CLI defaults to read-only preparation and rejects ambiguous arguments", () => {
  assert.deepEqual(parseProductionImportEntrypointArgs(["--config", "/tmp/example"]), { configPath: "/tmp/example", execute: false });
  assert.deepEqual(parseProductionImportEntrypointArgs(["--execute", "--config", "/tmp/example"]), { configPath: "/tmp/example", execute: true });
  assert.throws(() => parseProductionImportEntrypointArgs(["--config", "/tmp/a", "--config", "/tmp/b"]), error => error.code === "PRODUCTION_IMPORT_ENTRYPOINT_ARGUMENT_INVALID");
});

test("bounded private reads reject aggregate overflow, concurrent growth, and truncation", () => {
  const root = mkdtempSync(join(tmpdir(), "jinhu-prod-import-bounded-read-"));
  roots.push(root);
  const descriptor = privateBytes(root, "mutable.bin", Buffer.from("abcd"));
  assert.throws(
    () => readBoundedPrivateArtifactBytes(descriptor.path, "fixture", 16, { bytesRead: 7, maximumBytes: 10 }),
    error => error.code === "PRODUCTION_IMPORT_ENTRYPOINT_ARTIFACT_BUDGET_EXCEEDED",
  );
  assert.throws(
    () => readBoundedPrivateArtifactBytes(descriptor.path, "fixture", 16, undefined, { afterStat: () => appendFileSync(descriptor.path, "e") }),
    error => error.code === "PRODUCTION_IMPORT_ENTRYPOINT_FILE_CHANGED",
  );
  writeFileSync(descriptor.path, "abcd", { mode: 0o600 });
  assert.throws(
    () => readBoundedPrivateArtifactBytes(descriptor.path, "fixture", 16, undefined, { afterStat: () => truncateSync(descriptor.path, 0) }),
    error => error.code === "PRODUCTION_IMPORT_ENTRYPOINT_FILE_CHANGED",
  );
});

test("prepare validates sealed payload artifacts but never loads DB, crypto, or writer", async () => {
  const value = fixture();
  let sideEffectCalls = 0;
  const result = await runProductionImportEntrypoint({ configPath: value.configPath, execute: false }, dependencies(value.plan, {
    assertActivated() { const error = new Error("held"); error.code = "PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE"; throw error; },
    loadPg: async () => { sideEffectCalls += 1; },
    loadCryptoProviderModule: async () => { sideEffectCalls += 1; },
    executeImport: async () => { sideEffectCalls += 1; },
  }));
  assert.equal(result.status, "HOLD");
  assert.equal(result.databaseConnected, false);
  assert.equal(result.writeAttempted, false);
  assert.equal(result.readOnlyTargetVerified, false);
  assert.equal(result.envelopeAuthenticated, false);
  assert.equal(result.productionImportExecuted, false);
  assert.equal(result.fullProductMigrationComplete, false);
  assert.deepEqual(result.domains, ["T0", "T1", "T2", "T3"]);
  assert.equal(sideEffectCalls, 0);
});

test("prepare accepts the synthetic sealed plan through the real shared validator", async () => {
  const value = fixture();
  const result = await runProductionImportEntrypoint({ configPath: value.configPath, execute: false }, { now: NOW });
  assert.equal(result.status, "HOLD");
  assert.equal(result.readOnlyTargetVerified, false);
  assert.equal(result.productionImportExecuted, false);
});

test("execute refuses HOLD intent before reading credentials or opening PostgreSQL", async () => {
  const value = fixture({ withExecution: true });
  let pgCalls = 0;
  await assert.rejects(
    runProductionImportEntrypoint({ configPath: value.configPath, execute: true }, dependencies(value.plan, {
      assertActivated() {},
      loadPg: async () => { pgCalls += 1; },
    })),
    error => error.code === "PRODUCTION_IMPORT_ENTRYPOINT_EXECUTION_NOT_AUTHORIZED",
  );
  assert.equal(pgCalls, 0);
});

test("repository HOLD refuses execute before payload files or database material are read", async () => {
  const value = fixture({ intent: "EXECUTE_SEALED_PRODUCTION_IMPORT_ONCE", withExecution: true });
  const config = JSON.parse(readFileSync(value.configPath, "utf8"));
  config.artifacts.payloadBundles.T0 = { path: join(value.root, "must-not-be-read.json"), sha256: H("absent") };
  const heldConfig = privateJson(value.root, "held-entrypoint.json", config).path;
  let pgCalls = 0;
  await assert.rejects(
    runProductionImportEntrypoint({ configPath: heldConfig, execute: true }, dependencies(value.plan, {
      loadPg: async () => { pgCalls += 1; },
    })),
    error => error.code === "PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE",
  );
  assert.equal(pgCalls, 0);
});

test("unbound, tampered, wrong-target, wrong-scope, and stale runtime receipts all fail before PostgreSQL", async () => {
  const cases = [
    {
      expected: "PRODUCTION_IMPORT_RUNTIME_RELEASE_EVIDENCE_UNBOUND",
      mutate(_receipt, plan) { delete plan.runtimeReleaseEvidence; },
    },
    {
      expected: "PRODUCTION_IMPORT_RUNTIME_RELEASE_EVIDENCE_HASH_MISMATCH",
      mutate(receipt) { receipt.runtimeCodeSha = "b".repeat(40); },
      keepPlanHash: true,
    },
    {
      expected: "PRODUCTION_IMPORT_RUNTIME_RELEASE_EVIDENCE_TARGET_MISMATCH",
      mutate(receipt) { receipt.targetIdentitySha256 = H("another-target"); },
    },
    {
      expected: "PRODUCTION_IMPORT_RUNTIME_RELEASE_EVIDENCE_TARGET_MISMATCH",
      mutate(receipt) { receipt.targetScopeSha256 = H("another-scope"); },
    },
    {
      expected: "PRODUCTION_IMPORT_RUNTIME_RELEASE_EVIDENCE_TIME_INVALID",
      mutate(receipt, plan) {
        receipt.observedAt = "2026-09-05T00:40:00.000Z";
        receipt.expiresAt = "2026-09-05T00:59:00.000Z";
        plan.runtimeReleaseEvidence.observedAt = receipt.observedAt;
        plan.runtimeReleaseEvidence.expiresAt = receipt.expiresAt;
      },
    },
  ];
  for (const [index, scenario] of cases.entries()) {
    const value = fixture({ intent: "EXECUTE_SEALED_PRODUCTION_IMPORT_ONCE", withExecution: true });
    const config = JSON.parse(readFileSync(value.configPath, "utf8"));
    const receipt = JSON.parse(readFileSync(config.execution.runtimeEvidence.path, "utf8"));
    scenario.mutate(receipt, value.plan);
    if (scenario.expected !== "PRODUCTION_IMPORT_RUNTIME_RELEASE_EVIDENCE_UNBOUND") {
      config.execution.runtimeEvidence = privateJson(value.root, `runtime-invalid-${index}.json`, receipt);
      if (!scenario.keepPlanHash) value.plan.runtimeReleaseEvidence.artifactSha256 = config.execution.runtimeEvidence.sha256;
    }
    const configPath = privateJson(value.root, `entrypoint-runtime-invalid-${index}.json`, config).path;
    let pgCalls = 0;
    await assert.rejects(
      runProductionImportEntrypoint({ configPath, execute: true }, dependencies(value.plan, {
        assertActivated() {},
        currentCodeSha: () => CODE_SHA,
        loadPg: async () => { pgCalls += 1; },
      })),
      error => error.code === scenario.expected,
    );
    assert.equal(pgCalls, 0);
  }
});

test("execute authenticates every encrypted quarantine payload before opening PostgreSQL", async () => {
  const value = fixture({ intent: "EXECUTE_SEALED_PRODUCTION_IMPORT_ONCE", withExecution: true });
  const payload = { legacy_symbol: "?" };
  const sourceIdentitySha256 = H("quarantine:identity");
  const sourceRowSha256 = H("quarantine:source-row");
  const payloadSha256 = computeProductionImportPayloadHash(payload);
  const ciphertext = Buffer.from("synthetic-authenticated-ciphertext", "utf8");
  const keyReferenceSha256 = H("external-key-reference");
  const record = {
    disposition: "quarantine",
    sourceIdentitySha256,
    sourceRowSha256,
    payloadSha256,
    quarantine: {
      reasonCode: "LEGACY_SYMBOL_REVIEW",
      algorithm: "aes-256-gcm-external-kek-v1",
      payloadCiphertextSha256: H(ciphertext),
      keyReferenceSha256,
    },
  };
  const t3 = value.plan.phases.find(phase => phase.phase === "T3");
  t3.records = [record];
  const bundle = {
    formatVersion: 2,
    artifactKind: "yuzhou_hr_production_import_payload_bundle",
    phase: "T3",
    targetScope: TARGET_SCOPE,
    canonicalizationVersion: DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.canonicalizationVersion,
    sourceBatchManifestSha256: t3.sourceBatchManifestSha256,
    records: [{ sourceIdentitySha256, sourceRowSha256, targetTable: "hr_attendance_symbol_rule", payloadSha256, payload }],
  };
  const config = JSON.parse(readFileSync(value.configPath, "utf8"));
  config.artifacts.payloadBundles.T3 = privateJson(value.root, "T3-with-quarantine.json", bundle);
  t3.payloadBundleArtifactSha256 = config.artifacts.payloadBundles.T3.sha256;
  t3.payloadBundleSha256 = computeProductionImportPayloadBundleHash(bundle);
  config.execution.cryptoEnvelope = privateJson(value.root, "crypto-envelope-with-quarantine.json", {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_production_import_crypto_envelopes",
    operationId: value.plan.operationId,
    entries: [{
      kind: "quarantine",
      phaseName: "T3",
      sourceIdentitySha256,
      envelope: {
        algorithm: "aes-256-gcm-external-kek-v1",
        keyReferenceSha256,
        nonceHex: Buffer.alloc(12, 1).toString("hex"),
        authenticationTagHex: Buffer.alloc(16, 2).toString("hex"),
        ciphertextHex: ciphertext.toString("hex"),
      },
    }],
  });
  config.execution.cryptoKeyFiles = [{ keyReferenceSha256, keyFile: privateBytes(value.root, "external-key.bin", Buffer.alloc(32, 3)) }];
  const configPath = privateJson(value.root, "entrypoint-with-quarantine.json", config).path;
  let pgCalls = 0;
  let decryptCalls = 0;
  await assert.rejects(
    runProductionImportEntrypoint({ configPath, execute: true }, dependencies(value.plan, {
      assertActivated() {},
      currentCodeSha: () => CODE_SHA,
      loadCryptoProviderModule: async () => ({
        async decryptProductionImportEnvelope() {
          decryptCalls += 1;
          const error = new Error("synthetic authentication failure must not be surfaced");
          error.code = "PRODUCTION_IMPORT_CRYPTO_AUTHENTICATION_FAILED";
          throw error;
        },
      }),
      loadPg: async () => { pgCalls += 1; },
    })),
    error => error.code === "PRODUCTION_IMPORT_CRYPTO_AUTHENTICATION_FAILED",
  );
  assert.equal(decryptCalls, 1);
  assert.equal(pgCalls, 0);
});

test("plaintext PostgreSQL transport is loopback-only and rejects a remote host before driver load", async () => {
  const value = fixture({ intent: "EXECUTE_SEALED_PRODUCTION_IMPORT_ONCE", withExecution: true });
  const config = JSON.parse(readFileSync(value.configPath, "utf8"));
  config.execution.postgresCredentials = privateJson(value.root, "remote-credentials.json", {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_production_import_postgres_credentials",
    host: "198.51.100.10",
    port: 5432,
    database: value.binding.database,
    user: value.binding.databaseUser,
    password: "x",
    sslMode: "disable",
  });
  const configPath = privateJson(value.root, "remote-entrypoint.json", config).path;
  let pgCalls = 0;
  await assert.rejects(
    runProductionImportEntrypoint({ configPath, execute: true }, dependencies(value.plan, {
      assertActivated() {},
      currentCodeSha: () => CODE_SHA,
      loadCryptoProviderModule: async () => ({ decryptProductionImportEnvelope() { throw new Error("no encrypted records in fixture"); } }),
      loadPg: async () => { pgCalls += 1; },
    })),
    error => error.code === "PRODUCTION_IMPORT_ENTRYPOINT_DATABASE_TRANSPORT_UNSAFE",
  );
  assert.equal(pgCalls, 0);
});

test("pre-sealed before image reaches the writer callback unchanged and remains rollback-restorable", async () => {
  const root = mkdtempSync(join(tmpdir(), "jinhu-prod-import-crypto-chain-"));
  roots.push(root);
  const operationId = "yzprod-import-20260905T010000Z-abcdef123456";
  const keyReferenceSha256 = H("external-reference-is-not-key-material");
  const key = Buffer.alloc(32, 7);
  const payload = { org_code: "SYNTHETIC", org_name: "Synthetic department", org_type: "department", sort_order: 1, status: "enabled", remark: null };
  const canonicalSha256 = computeProductionImportTargetCanonicalHash("sys_org", TARGET_SCOPE, payload, { parent_id: null });
  const targetBefore = { payload, derivedFields: { parent_id: null }, version: 2, canonicalSha256 };
  const record = {
    disposition: "merge",
    sourceSystem: "yuzhou-v10",
    sourceTable: "dbo.departmentcode",
    sourceIdentitySha256: H("synthetic-source-identity"),
    sourceRowSha256: H("synthetic-source-row"),
    payloadSha256: computeProductionImportPayloadHash(payload),
    plannedTargetTable: "sys_org",
    targetTable: "sys_org",
    targetId: "00000000-0000-5000-8000-000000000001",
    expectedTargetVersionBefore: 2,
    expectedTargetBeforeSha256: canonicalSha256,
  };
  const resolveKey = async () => key;
  const sealed = await encryptProductionImportEnvelope({
    kind: "before_image",
    operationId,
    phaseName: "T0",
    targetScope: TARGET_SCOPE,
    record,
    keyReferenceSha256,
    value: targetBefore,
  }, { resolveKey });
  record.beforeImage = sealed.binding;
  const keyFile = privateBytes(root, "external-key.bin", key);
  assert.notEqual(keyFile.sha256, keyReferenceSha256);
  const provider = await createProductionImportArtifactCryptoProvider({
    envelopeArtifact: {
      formatVersion: 1,
      artifactKind: "yuzhou_hr_production_import_crypto_envelopes",
      operationId,
      entries: [{
        kind: "before_image",
        phaseName: "T0",
        sourceIdentitySha256: record.sourceIdentitySha256,
        envelope: {
          algorithm: sealed.envelope.algorithm,
          keyReferenceSha256,
          nonceHex: sealed.envelope.nonce.toString("hex"),
          authenticationTagHex: sealed.envelope.authenticationTag.toString("hex"),
          ciphertextHex: sealed.envelope.ciphertext.toString("hex"),
        },
      }],
    },
    keyFiles: [{ keyReferenceSha256, keyFile }],
    plan: { operationId, targetScope: TARGET_SCOPE, phases: [{ phase: "T0", records: [record] }] },
    payloadBundles: { T0: Buffer.from(JSON.stringify({ records: [] })) },
    decryptEnvelope: decryptProductionImportEnvelope,
  });
  try {
    const writerBeforeImage = await provider.encryptBeforeImage({ phaseName: "T0", record, targetBefore });
    assert.deepEqual(writerBeforeImage.ciphertext, sealed.envelope.ciphertext);
    assert.deepEqual(writerBeforeImage.nonce, sealed.envelope.nonce);
    assert.deepEqual(writerBeforeImage.authenticationTag, sealed.envelope.authenticationTag);

    const controlReadbackEnvelope = {
      algorithm: record.beforeImage.algorithm,
      keyReferenceSha256,
      ciphertext: Buffer.from(writerBeforeImage.ciphertext),
      nonce: Buffer.from(writerBeforeImage.nonce),
      authenticationTag: Buffer.from(writerBeforeImage.authenticationTag),
    };
    const rollbackResult = await decryptProductionImportEnvelope({
      kind: "before_image",
      operationId,
      phaseName: "T0",
      targetScope: TARGET_SCOPE,
      record,
      keyReferenceSha256,
      envelope: controlReadbackEnvelope,
    }, { resolveKey });
    assert.deepEqual(rollbackResult, { plaintextSha256: canonicalSha256, targetBefore });
  } finally {
    provider.destroy();
    key.fill(0);
  }
});

test("unsupported or standalone scope fails before any database connection", async () => {
  for (const input of [
    fixture({ domains: ["T0", "T1", "T2", "T3", "T4"] }),
    fixture({ deploymentMode: "standalone_enterprise" }),
  ]) {
    let pgCalls = 0;
    await assert.rejects(
      runProductionImportEntrypoint({ configPath: input.configPath, execute: false }, dependencies(input.plan, { loadPg: async () => { pgCalls += 1; } })),
      error => ["PRODUCTION_IMPORT_ENTRYPOINT_DOMAIN_UNSUPPORTED", "PRODUCTION_IMPORT_STANDALONE_TARGET_CONTRACT_UNAVAILABLE"].includes(error.code),
    );
    assert.equal(pgCalls, 0);
  }
});

test("explicit execution probes exact binding then invokes the existing sealed writer once", async () => {
  const value = fixture({ intent: "EXECUTE_SEALED_PRODUCTION_IMPORT_ONCE", withExecution: true });
  const config = JSON.parse(readFileSync(value.configPath, "utf8"));
  config.execution.postgresCredentials = privateJson(value.root, "short-existing-password.json", {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_production_import_postgres_credentials",
    host: "127.0.0.1",
    port: 5432,
    database: value.binding.database,
    user: value.binding.databaseUser,
    password: "x",
    sslMode: "disable",
  });
  const configPath = privateJson(value.root, "short-existing-password-entrypoint.json", config).path;
  const calls = [];
  class Pool {
    constructor(options) { calls.push({ kind: "pool", options: { ...options, password: "[redacted]" } }); }
    async end() { calls.push({ kind: "pool-end" }); }
  }
  const adapter = {
    queryReadOnly: async () => ({ rows: [] }),
    async probeTarget(expected) { calls.push({ kind: "probe", expected }); return { readOnlyProbe: true }; },
    async close() { calls.push({ kind: "adapter-close" }); },
  };
  const result = await runProductionImportEntrypoint({ configPath, execute: true }, dependencies(value.plan, {
    validatePlan: undefined,
    assertActivated() {},
    currentCodeSha: () => CODE_SHA,
    loadCryptoProviderModule: async () => ({ decryptProductionImportEnvelope() { throw new Error("no encrypted records in fixture"); } }),
    loadPg: async () => ({ Pool }),
    createAdapter(options) { calls.push({ kind: "adapter", binding: options.binding }); return adapter; },
    createPhaseWriters() { calls.push({ kind: "writers" }); return Object.fromEntries(["T0", "T1", "T2", "T3"].map(phase => [phase, async () => ({})])); },
    async executeImport(_plan, options) {
      calls.push({ kind: "execute", targetIdentitySha256: options.targetIdentitySha256, targetScope: options.targetScope });
      return { operationId: value.plan.operationId, sealedPlanSha256: value.plan.sealing.sealedPlanSha256, status: "succeeded", phases: ["T0", "T1", "T2", "T3"] };
    },
  }));
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.readOnlyTargetVerified, true);
  assert.equal(result.envelopeAuthenticated, true);
  assert.equal(result.productionImportExecuted, true);
  assert.equal(result.fullProductMigrationComplete, false);
  assert.deepEqual(calls.map(row => row.kind), ["pool", "adapter", "probe", "writers", "execute", "adapter-close"]);
  assert.equal(JSON.stringify(result).includes("fixture-password"), false);
});

test("entrypoint source has no alternate contract, plugin, shell, or lab execution path", () => {
  const source = readFileSync(new URL("../hr-cutover/execute-production-import.mjs", import.meta.url), "utf8");
  assert.match(source, /DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT/u);
  assert.match(source, /executeSealedProductionImport/u);
  assert.match(source, /createProductionImportPostgresAdapter/u);
  assert.match(source, /createProductionImportPhaseWriters/u);
  assert.match(source, /ls-files[\s\S]*diff[\s\S]*--cached[\s\S]*rev-parse/u);
  assert.doesNotMatch(source, /production-import-real-artifact-bridge|full-domain-lifecycle|run-final-rehearsal|docker|child_process.*spawn|eval\(|new Function/u);
  assert.ok(ProductionImportEntrypointError);
});
