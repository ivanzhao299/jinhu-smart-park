import {
  DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT,
  ProductionImportExecutionError,
  assertProductionImportExecutionActivated,
  computeProductionImportApprovalSetHash,
  computeProductionImportPayloadHash,
  computeProductionImportPayloadBundleHash,
  productionImportHash,
  validateProductionImportPayloadBundle,
  validateProductionImportRollbackAuthorization,
  validateSealedProductionImportPlan,
} from "./production-import-sealed-plan-lib.mjs";
import { writeT5NonfilePrivateStage } from "./production-import-t5-nonfile-writer.mjs";

const fail = (code, detail) => { throw new ProductionImportExecutionError(code, detail); };
const asBuffer = (value, label) => {
  if (!Buffer.isBuffer(value) || value.length === 0) fail("PRODUCTION_IMPORT_WRITER_RESULT_INVALID", `${label} must be a non-empty Buffer`);
  return value;
};
const assertSha = (value, label) => { if (!/^[0-9a-f]{64}$/u.test(value ?? "")) fail("PRODUCTION_IMPORT_WRITER_RESULT_INVALID", `${label} invalid`); };

async function expectSingleStateTransition(tx, sql, parameters, label) {
  const result = await tx.query(sql, parameters);
  if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) {
    fail("PRODUCTION_IMPORT_STATE_TRANSITION_FAILED", `${label} affected ${result?.rows?.length ?? "unknown"} rows`);
  }
  return result.rows[0];
}

function validatePhasePayloadBundle(phase, targetScope, artifact) {
  const bytes = asBuffer(artifact, `${phase.phase}.payloadBundleArtifact`);
  if (productionImportHash(bytes) !== phase.payloadBundleArtifactSha256) fail("PRODUCTION_IMPORT_PAYLOAD_ARTIFACT_HASH_MISMATCH", phase.phase);
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_INVALID", `${phase.phase} artifact is not JSON`);
  }
  const bundle = validateProductionImportPayloadBundle(parsed, {
    phase: phase.phase,
    targetScope,
    sourceBatchManifestSha256: phase.sourceBatchManifestSha256,
    canonicalizationVersion: phase.canonicalizationVersion,
  });
  if (computeProductionImportPayloadBundleHash(bundle) !== phase.payloadBundleSha256) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_HASH_MISMATCH", phase.phase);
  if (bundle.records.length !== phase.records.length) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_BINDING_MISMATCH", `${phase.phase} record count differs`);
  const planned = new Map(phase.records.map(record => [record.sourceIdentitySha256, record]));
  for (const row of bundle.records) {
    const record = planned.get(row.sourceIdentitySha256);
    if (!record || row.sourceRowSha256 !== record.sourceRowSha256 || row.payloadSha256 !== record.payloadSha256 || row.targetTable !== record.plannedTargetTable) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_BINDING_MISMATCH", `${phase.phase}.${row.sourceIdentitySha256}`);
    planned.delete(row.sourceIdentitySha256);
  }
  if (planned.size !== 0) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_BINDING_MISMATCH", `${phase.phase} planned record absent from bundle`);
  return bundle;
}

function validatePhaseResults(phase, targetScope, result) {
  if (!result || typeof result !== "object" || !Array.isArray(result.records) || result.records.length !== phase.records.length) fail("PRODUCTION_IMPORT_WRITER_RESULT_INVALID", `${phase.phase} result count differs`);
  if (result.payloadBundleArtifactSha256 !== phase.payloadBundleArtifactSha256 || result.payloadBundleSha256 !== phase.payloadBundleSha256 || result.canonicalizationVersion !== phase.canonicalizationVersion || result.targetScopeSha256 !== targetScope.scopeSha256) fail("PRODUCTION_IMPORT_WRITER_RESULT_INVALID", `${phase.phase} payload/scope receipt differs`);
  assertSha(result.afterCanonicalSha256, `${phase.phase}.afterCanonicalSha256`);
  if (result.afterCanonicalSha256 !== phase.expectedAfterCanonicalSha256) fail("PRODUCTION_IMPORT_CANONICAL_HASH_MISMATCH", phase.phase);
  const expected = new Map(phase.records.map(record => [record.sourceIdentitySha256, record]));
  const seen = new Set();
  for (const row of result.records) {
    const record = expected.get(row?.sourceIdentitySha256);
    if (!record || seen.has(row.sourceIdentitySha256) || row.disposition !== record.disposition) fail("PRODUCTION_IMPORT_WRITER_RESULT_INVALID", `${phase.phase} unbound result`);
    seen.add(row.sourceIdentitySha256);
    if (record.disposition !== "quarantine") {
      if (row.targetId !== record.targetId) fail("PRODUCTION_IMPORT_WRITER_RESULT_INVALID", `${phase.phase} target differs`);
      assertSha(row.targetAfterSha256, `${phase.phase}.targetAfterSha256`);
      if (row.targetAfterSha256 !== record.expectedTargetAfterSha256) fail("PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED", `${phase.phase} target after hash differs`);
      if (!Number.isSafeInteger(row.targetVersionAfter) || row.targetVersionAfter !== record.targetVersionAfter) fail("PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED", `${phase.phase} target after version differs`);
    }
    if (record.disposition === "merge") {
      const before = row.beforeImage;
      asBuffer(before?.ciphertext, "beforeImage.ciphertext");
      const nonce = asBuffer(before?.nonce, "beforeImage.nonce");
      const tag = asBuffer(before?.authenticationTag, "beforeImage.authenticationTag");
      if (nonce.length !== 12 || tag.length !== 16 || productionImportHash(before.ciphertext) !== record.beforeImage.ciphertextSha256) fail("PRODUCTION_IMPORT_BEFORE_IMAGE_INVALID", `${phase.phase} ciphertext contract differs`);
    }
    if (record.disposition === "quarantine") {
      const payload = asBuffer(row.quarantineCiphertext, "quarantineCiphertext");
      const nonce = asBuffer(row.quarantineNonce, "quarantineNonce");
      const tag = asBuffer(row.quarantineAuthenticationTag, "quarantineAuthenticationTag");
      if (nonce.length !== 12 || tag.length !== 16 || productionImportHash(payload) !== record.quarantine.payloadCiphertextSha256) fail("PRODUCTION_IMPORT_QUARANTINE_INVALID", `${phase.phase} quarantine bytes differ`);
    }
  }
  return result;
}

const CONTROL_BATCH_SIZE = 1000;
const batches = rows => Array.from({ length: Math.ceil(rows.length / CONTROL_BATCH_SIZE) }, (_, index) => rows.slice(index * CONTROL_BATCH_SIZE, (index + 1) * CONTROL_BATCH_SIZE));
const base64 = value => value.toString("base64");

async function recordControlRows(tx, operationId, phase, result) {
  const resultBySourceIdentity = new Map(result.records.map(row => [row.sourceIdentitySha256, row]));
  const records = [];
  const dependencies = [];
  const beforeImages = [];
  const quarantines = [];
  for (const planned of phase.records) {
    const row = resultBySourceIdentity.get(planned.sourceIdentitySha256);
    records.push({ operation_id: operationId, phase: phase.phase, source_system: planned.sourceSystem, source_table: planned.sourceTable, source_pk_canonical: planned.sourcePkCanonical, source_identity_sha256: planned.sourceIdentitySha256, source_row_sha256: planned.sourceRowSha256, disposition: planned.disposition, planned_target_table: planned.plannedTargetTable, target_table: planned.targetTable ?? null, target_id: row.targetId ?? null, business_identity_sha256: planned.businessIdentitySha256 ?? null, expected_target_before_sha256: planned.expectedTargetBeforeSha256 ?? null, target_after_sha256: row.targetAfterSha256 ?? null, expected_target_version_before: planned.expectedTargetVersionBefore ?? null, target_version_after: row.targetVersionAfter ?? null, decision_attestation_sha256: planned.decisionAttestationSha256 ?? null });
    for (const dependency of planned.dependencyRefs) {
      dependencies.push({ operation_id: operationId, phase: phase.phase, source_identity_sha256: planned.sourceIdentitySha256, dependency_role: dependency.role, depends_on_phase: dependency.phase, depends_on_source_identity_sha256: dependency.sourceIdentitySha256, expected_target_table: dependency.expectedTargetTable });
    }
    if (planned.disposition === "merge") {
      beforeImages.push({ operation_id: operationId, phase: phase.phase, source_identity_sha256: planned.sourceIdentitySha256, plaintext_sha256: planned.beforeImage.plaintextSha256, ciphertext_sha256: planned.beforeImage.ciphertextSha256, key_reference_sha256: planned.beforeImage.keyReferenceSha256, nonce_base64: base64(row.beforeImage.nonce), authentication_tag_base64: base64(row.beforeImage.authenticationTag), ciphertext_base64: base64(row.beforeImage.ciphertext), algorithm: planned.beforeImage.algorithm });
    }
    if (planned.disposition === "quarantine") {
      quarantines.push({ operation_id: operationId, phase: phase.phase, source_identity_sha256: planned.sourceIdentitySha256, reason_code: planned.quarantine.reasonCode, algorithm: planned.quarantine.algorithm, key_reference_sha256: planned.quarantine.keyReferenceSha256, nonce_base64: base64(row.quarantineNonce), authentication_tag_base64: base64(row.quarantineAuthenticationTag), payload_ciphertext_sha256: planned.quarantine.payloadCiphertextSha256, payload_ciphertext_base64: base64(row.quarantineCiphertext), decision_attestation_sha256: planned.decisionAttestationSha256 });
    }
  }
  for (const batch of batches(records)) await tx.query(
    `INSERT INTO hr_yuzhou_production_import_record(operation_id,phase,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,owner_source_identity_sha256,disposition,planned_target_table,target_table,target_id,business_identity_sha256,expected_target_before_sha256,target_after_sha256,expected_target_version_before,target_version_after,decision_attestation_sha256)
     SELECT x.operation_id,x.phase,x.source_system,x.source_table,x.source_pk_canonical,x.source_identity_sha256,x.source_row_sha256,NULL,x.disposition,x.planned_target_table,x.target_table,x.target_id,x.business_identity_sha256,x.expected_target_before_sha256,x.target_after_sha256,x.expected_target_version_before,x.target_version_after,x.decision_attestation_sha256
     FROM jsonb_to_recordset($1::jsonb) AS x(operation_id varchar,phase varchar,source_system varchar,source_table varchar,source_pk_canonical varchar,source_identity_sha256 char(64),source_row_sha256 char(64),disposition varchar,planned_target_table varchar,target_table varchar,target_id uuid,business_identity_sha256 char(64),expected_target_before_sha256 char(64),target_after_sha256 char(64),expected_target_version_before bigint,target_version_after bigint,decision_attestation_sha256 char(64))`,
    [JSON.stringify(batch)],
  );
  for (const batch of batches(dependencies)) await tx.query(
    `INSERT INTO hr_yuzhou_production_import_record_dependency(operation_id,phase,source_identity_sha256,dependency_role,depends_on_phase,depends_on_source_identity_sha256,expected_target_table)
     SELECT x.operation_id,x.phase,x.source_identity_sha256,x.dependency_role,x.depends_on_phase,x.depends_on_source_identity_sha256,x.expected_target_table
     FROM jsonb_to_recordset($1::jsonb) AS x(operation_id varchar,phase varchar,source_identity_sha256 char(64),dependency_role varchar,depends_on_phase varchar,depends_on_source_identity_sha256 char(64),expected_target_table varchar)`,
    [JSON.stringify(batch)],
  );
  for (const batch of batches(beforeImages)) await tx.query(
    `INSERT INTO hr_yuzhou_production_import_before_image(operation_id,phase,source_identity_sha256,plaintext_sha256,ciphertext_sha256,key_reference_sha256,nonce,authentication_tag,ciphertext,algorithm)
     SELECT x.operation_id,x.phase,x.source_identity_sha256,x.plaintext_sha256,x.ciphertext_sha256,x.key_reference_sha256,decode(x.nonce_base64,'base64'),decode(x.authentication_tag_base64,'base64'),decode(x.ciphertext_base64,'base64'),x.algorithm
     FROM jsonb_to_recordset($1::jsonb) AS x(operation_id varchar,phase varchar,source_identity_sha256 char(64),plaintext_sha256 char(64),ciphertext_sha256 char(64),key_reference_sha256 char(64),nonce_base64 text,authentication_tag_base64 text,ciphertext_base64 text,algorithm varchar)`,
    [JSON.stringify(batch)],
  );
  for (const batch of batches(quarantines)) await tx.query(
    `INSERT INTO hr_yuzhou_production_import_quarantine(operation_id,phase,source_identity_sha256,reason_code,algorithm,key_reference_sha256,nonce,authentication_tag,payload_ciphertext_sha256,payload_ciphertext,decision_attestation_sha256)
     SELECT x.operation_id,x.phase,x.source_identity_sha256,x.reason_code,x.algorithm,x.key_reference_sha256,decode(x.nonce_base64,'base64'),decode(x.authentication_tag_base64,'base64'),x.payload_ciphertext_sha256,decode(x.payload_ciphertext_base64,'base64'),x.decision_attestation_sha256
     FROM jsonb_to_recordset($1::jsonb) AS x(operation_id varchar,phase varchar,source_identity_sha256 char(64),reason_code varchar,algorithm varchar,key_reference_sha256 char(64),nonce_base64 text,authentication_tag_base64 text,payload_ciphertext_sha256 char(64),payload_ciphertext_base64 text,decision_attestation_sha256 char(64))`,
    [JSON.stringify(batch)],
  );
}

function bindT5NonfilePrivateStage(plan, privateStage) {
  if (!plan.t5Nonfile) return null;
  if (!privateStage || typeof privateStage !== "object" || Array.isArray(privateStage)) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_REQUIRED", "sealed T5 binding requires its private stage");
  if (computeProductionImportPayloadHash(privateStage) !== plan.t5Nonfile.privateStageSha256) fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_HASH_MISMATCH", "private stage hash differs from sealed authorization");
  if (privateStage.phase !== "T5" || privateStage.sourceSnapshotHash !== plan.triple.sourceSnapshotHash || privateStage.sourceSnapshotHash !== plan.t5Nonfile.sourceSnapshotSha256 || privateStage.sourceRestoreReceiptSha256 !== plan.t5Nonfile.sourceRestoreReceiptSha256 || privateStage.sourceBusinessSha256 !== plan.t5Nonfile.sourceBusinessSha256 || !Array.isArray(privateStage.records) || privateStage.records.length !== plan.t5Nonfile.recordCount) {
    fail("PRODUCTION_IMPORT_T5_NONFILE_STAGE_BINDING_MISMATCH", "private stage metadata differs from the sealed plan");
  }
  return structuredClone(privateStage);
}

const t5BeforeCanonicalSha256 = (targetScope, privateStageSha256) => productionImportHash(Buffer.from(`yuzhou-hr-production-t5-insert-only-before-v1\0${targetScope.scopeSha256}\0${privateStageSha256}`));

async function recordT5ControlRows(tx, operationId, privateStage, result) {
  const bySource = new Map(result.records.map(record => [record.sourceIdentitySha256, record]));
  if (bySource.size !== privateStage.records.length) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_RESULT_INVALID", "T5 result/source count differs");
  const controls = [];
  const dependencies = [];
  for (const staged of privateStage.records) {
    const written = bySource.get(staged.sourceIdentitySha256);
    if (!written || written.disposition !== staged.disposition || written.targetTable !== staged.targetTable) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_RESULT_INVALID", "T5 result is not bound to its private stage");
    const inserted = staged.disposition === "insert";
    if (inserted && (!written.targetId || !written.businessIdentitySha256 || !written.targetAfterSha256 || written.targetVersionAfter !== 1)) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_RESULT_INVALID", "T5 insert receipt incomplete");
    if (!inserted && (!written.decisionAttestationSha256 || written.targetId !== undefined)) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_RESULT_INVALID", "T5 quarantine receipt incomplete");
    controls.push({
      operation_id: operationId, phase: "T5", source_system: staged.sourceSystem, source_table: staged.sourceTable,
      source_pk_canonical: staged.sourcePkCanonical, source_identity_sha256: staged.sourceIdentitySha256,
      source_row_sha256: staged.sourceRowSha256, owner_source_identity_sha256: staged.dependencyRefs[0]?.sourceIdentitySha256 ?? null,
      disposition: staged.disposition, planned_target_table: staged.targetTable, target_table: inserted ? staged.targetTable : null,
      target_id: inserted ? written.targetId : null, business_identity_sha256: inserted ? written.businessIdentitySha256 : null,
      target_after_sha256: inserted ? written.targetAfterSha256 : null, target_version_after: inserted ? 1 : null,
      decision_attestation_sha256: inserted ? null : written.decisionAttestationSha256,
    });
    for (const dependency of staged.dependencyRefs) dependencies.push({ operation_id: operationId, phase: "T5", source_identity_sha256: staged.sourceIdentitySha256, dependency_role: dependency.role, depends_on_phase: dependency.phase, depends_on_source_identity_sha256: dependency.sourceIdentitySha256, expected_target_table: dependency.expectedTargetTable });
  }
  for (const batch of batches(controls)) await tx.query(
    `INSERT INTO hr_yuzhou_production_import_record(operation_id,phase,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,owner_source_identity_sha256,disposition,planned_target_table,target_table,target_id,business_identity_sha256,expected_target_before_sha256,target_after_sha256,expected_target_version_before,target_version_after,decision_attestation_sha256)
     SELECT x.operation_id,x.phase,x.source_system,x.source_table,x.source_pk_canonical,x.source_identity_sha256,x.source_row_sha256,x.owner_source_identity_sha256,x.disposition,x.planned_target_table,x.target_table,x.target_id,x.business_identity_sha256,NULL,x.target_after_sha256,NULL,x.target_version_after,x.decision_attestation_sha256
     FROM jsonb_to_recordset($1::jsonb) AS x(operation_id varchar,phase varchar,source_system varchar,source_table varchar,source_pk_canonical varchar,source_identity_sha256 char(64),source_row_sha256 char(64),owner_source_identity_sha256 char(64),disposition varchar,planned_target_table varchar,target_table varchar,target_id uuid,business_identity_sha256 char(64),target_after_sha256 char(64),target_version_after bigint,decision_attestation_sha256 char(64))`,
    [JSON.stringify(batch)],
  );
  for (const batch of batches(dependencies)) await tx.query(
    `INSERT INTO hr_yuzhou_production_import_record_dependency(operation_id,phase,source_identity_sha256,dependency_role,depends_on_phase,depends_on_source_identity_sha256,expected_target_table)
     SELECT x.operation_id,x.phase,x.source_identity_sha256,x.dependency_role,x.depends_on_phase,x.depends_on_source_identity_sha256,x.expected_target_table
     FROM jsonb_to_recordset($1::jsonb) AS x(operation_id varchar,phase varchar,source_identity_sha256 char(64),dependency_role varchar,depends_on_phase varchar,depends_on_source_identity_sha256 char(64),expected_target_table varchar)`,
    [JSON.stringify(batch)],
  );
}

export async function executeSealedProductionImport(planInput, options) {
  const contract = options?.contract ?? DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT;
  const plan = validateSealedProductionImportPlan(planInput, { contract, now: options?.now ?? new Date() });
  assertProductionImportExecutionActivated(plan, contract);
  if (options?.currentCodeSha !== plan.triple.codeSha || options?.mergedCodeSha !== plan.triple.codeSha) fail("PRODUCTION_IMPORT_CODE_SHA_MISMATCH", "current and merged code must equal the sealed SHA");
  if (options?.targetIdentitySha256 !== plan.target.identitySha256) fail("PRODUCTION_IMPORT_TARGET_IDENTITY_MISMATCH", "database adapter target differs from sealed target");
  if (!options?.targetScope || options.targetScope.tenantId !== plan.targetScope.tenantId || options.targetScope.parkId !== plan.targetScope.parkId || options.targetScope.scopeSha256 !== plan.targetScope.scopeSha256) fail("PRODUCTION_IMPORT_TARGET_SCOPE_MISMATCH", "database adapter scope differs from sealed target scope");
  if (!options?.database || typeof options.database.transaction !== "function") fail("PRODUCTION_IMPORT_DATABASE_ADAPTER_REQUIRED", "database transaction adapter missing");
  for (const phase of plan.phaseOrder) if (typeof options.phaseWriters?.[phase] !== "function") fail("PRODUCTION_IMPORT_PHASE_WRITER_REQUIRED", phase);
  const payloadBundles = new Map();
  for (const phase of plan.phases) payloadBundles.set(phase.phase, validatePhasePayloadBundle(phase, plan.targetScope, options.payloadBundles?.[phase.phase]));
  const t5PrivateStage = bindT5NonfilePrivateStage(plan, options.t5NonfilePrivateStage);
  await options.database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "consume_import_authorization" }, async tx => {
    if (!tx || typeof tx.query !== "function") fail("PRODUCTION_IMPORT_DATABASE_ADAPTER_REQUIRED", "transaction query adapter missing");
    await tx.query(
      "SELECT hr_yuzhou_consume_import_authorization_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)",
      [
        plan.operationId, plan.triple.codeSha, plan.triple.sourceSnapshotHash, plan.triple.mappingContractHash,
        plan.sealing.sealedPlanSha256, plan.target.identitySha256, plan.targetScope.tenantId, plan.targetScope.parkId, plan.targetScope.scopeSha256, plan.authorization.artifactSha256,
        plan.authorization.nonceSha256, plan.authorization.issuedAt, plan.authorization.expiresAt,
        plan.window.startsAt, plan.window.endsAt, computeProductionImportApprovalSetHash(plan.authorization.approvalSet),
        plan.manifestSha256, plan.finalRehearsalPair.artifactSha256,
        plan.finalRehearsalPair.rehearsals[0].manifestSha256, plan.finalRehearsalPair.rehearsals[1].manifestSha256,
      ],
    );
  });
  try {
    return await options.database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "apply_t0_t5" }, async tx => {
    if (!tx || typeof tx.query !== "function") fail("PRODUCTION_IMPORT_DATABASE_ADAPTER_REQUIRED", "transaction query adapter missing");
    await tx.query("SELECT hr_yuzhou_start_production_import($1,$2)", [plan.operationId, plan.sealing.sealedPlanSha256]);
    for (const phase of plan.phases) {
      await tx.query(
        `INSERT INTO hr_yuzhou_production_import_phase(operation_id,phase,phase_ordinal,status,source_batch_manifest_sha256,payload_bundle_artifact_sha256,payload_bundle_sha256,canonicalization_version,planned_record_count,before_canonical_sha256,started_at)
         VALUES($1,$2,$3,'running',$4,$5,$6,$7,$8,$9,now())`,
        [plan.operationId, phase.phase, phase.ordinal, phase.sourceBatchManifestSha256, phase.payloadBundleArtifactSha256, phase.payloadBundleSha256, phase.canonicalizationVersion, phase.records.length, phase.beforeCanonicalSha256],
      );
      const result = validatePhaseResults(phase, plan.targetScope, await options.phaseWriters[phase.phase]({ tx, operationId: plan.operationId, targetScope: structuredClone(plan.targetScope), phase: structuredClone(phase), payloadBundle: structuredClone(payloadBundles.get(phase.phase)) }));
      await recordControlRows(tx, plan.operationId, phase, result);
      await expectSingleStateTransition(tx,
        `UPDATE hr_yuzhou_production_import_phase SET status='succeeded',applied_record_count=$3,after_canonical_sha256=$4,finished_at=now()
         WHERE operation_id=$1 AND phase=$2 AND status='running'
         RETURNING phase,status`,
        [plan.operationId, phase.phase, phase.records.length, result.afterCanonicalSha256],
        `${phase.phase} succeeded`,
      );
      await expectSingleStateTransition(
        tx,
        "UPDATE hr_yuzhou_production_import_operation SET current_phase=$2 WHERE operation_id=$1 AND status='running' RETURNING operation_id,current_phase",
        [plan.operationId, phase.phase],
        `${phase.phase} operation progress`,
      );
    }
    if (t5PrivateStage) {
      const beforeCanonicalSha256 = t5BeforeCanonicalSha256(plan.targetScope, plan.t5Nonfile.privateStageSha256);
      await tx.query(
        `INSERT INTO hr_yuzhou_production_import_phase(operation_id,phase,phase_ordinal,status,source_batch_manifest_sha256,payload_bundle_artifact_sha256,payload_bundle_sha256,canonicalization_version,planned_record_count,before_canonical_sha256,started_at)
         VALUES($1,'T5',4,'running',$2,$2,$2,$3,$4,$5,now())`,
        [plan.operationId, plan.t5Nonfile.privateStageSha256, "yuzhou-production-import-canonical-json-v1", t5PrivateStage.records.length, beforeCanonicalSha256],
      );
      await expectSingleStateTransition(
        tx,
        "UPDATE hr_yuzhou_production_import_operation SET current_phase='T5' WHERE operation_id=$1 AND status='running' RETURNING operation_id,current_phase",
        [plan.operationId],
        "T5 operation progress",
      );
      const result = await writeT5NonfilePrivateStage({ tx, operationId: plan.operationId, targetScope: structuredClone(plan.targetScope), actorId: plan.t5Nonfile.actorId, privateStage: t5PrivateStage });
      if (result.phase !== "T5" || result.counts?.source !== t5PrivateStage.records.length || !/^[0-9a-f]{64}$/u.test(result.afterCanonicalSha256 ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_RESULT_INVALID", "T5 writer result invalid");
      await recordT5ControlRows(tx, plan.operationId, t5PrivateStage, result);
      await expectSingleStateTransition(tx,
        `UPDATE hr_yuzhou_production_import_phase SET status='succeeded',applied_record_count=$3,after_canonical_sha256=$4,finished_at=now()
         WHERE operation_id=$1 AND phase='T5' AND status='running'
         RETURNING phase,status`,
        [plan.operationId, "T5", t5PrivateStage.records.length, result.afterCanonicalSha256],
        "T5 succeeded",
      );
    }
    await expectSingleStateTransition(
      tx,
      "UPDATE hr_yuzhou_production_import_operation SET status='succeeded',finished_at=now() WHERE operation_id=$1 AND status='running' RETURNING operation_id,status",
      [plan.operationId],
      "operation succeeded",
    );
    return { operationId: plan.operationId, status: "succeeded", phases: [...plan.phaseOrder, ...(t5PrivateStage ? ["T5"] : [])], sealedPlanSha256: plan.sealing.sealedPlanSha256 };
  });
  } catch (error) {
    const failureCode = error instanceof ProductionImportExecutionError ? error.code : "PRODUCTION_IMPORT_BUSINESS_TRANSACTION_FAILED";
    await options.database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "record_import_failure" }, async tx => {
      await expectSingleStateTransition(tx,
        "UPDATE hr_yuzhou_production_import_operation SET status='failed',failure_code=$2,finished_at=now() WHERE operation_id=$1 AND status='authorized' RETURNING operation_id,status",
        [plan.operationId, failureCode],
        "operation failed",
      );
    });
    throw error;
  }
}

export async function rollbackSealedProductionImport(planInput, rollbackAuthorizationInput, options) {
  const contract = options?.contract ?? DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT;
  const plan = validateSealedProductionImportPlan(planInput, { contract, now: options?.now ?? new Date() });
  assertProductionImportExecutionActivated(plan, contract);
  const rollbackAuthorization = validateProductionImportRollbackAuthorization(rollbackAuthorizationInput, plan, { now: options?.now ?? new Date() });
  if (options?.currentCodeSha !== plan.triple.codeSha || options?.mergedCodeSha !== plan.triple.codeSha) fail("PRODUCTION_IMPORT_CODE_SHA_MISMATCH", "current and merged code must equal the sealed SHA");
  if (options?.targetIdentitySha256 !== plan.target.identitySha256) fail("PRODUCTION_IMPORT_TARGET_IDENTITY_MISMATCH", "database adapter target differs from sealed target");
  if (!options?.targetScope || options.targetScope.tenantId !== plan.targetScope.tenantId || options.targetScope.parkId !== plan.targetScope.parkId || options.targetScope.scopeSha256 !== plan.targetScope.scopeSha256) fail("PRODUCTION_IMPORT_TARGET_SCOPE_MISMATCH", "database adapter scope differs from sealed target scope");
  if (!options?.database || typeof options.database.transaction !== "function" || typeof options.rollbackPhase !== "function" || typeof options.verifyBusinessResiduals !== "function") fail("PRODUCTION_IMPORT_ROLLBACK_ADAPTER_REQUIRED", "bulk rollback and business residual adapters are required");
  await options.database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "consume_rollback_authorization" }, async tx => {
    await tx.query(
      "SELECT hr_yuzhou_consume_rollback_authorization($1,$2,$3,$4,$5,$6,$7,$8)",
      [rollbackAuthorization.rollbackOperationId, plan.operationId, plan.sealing.sealedPlanSha256, plan.target.identitySha256, rollbackAuthorization.authorizationArtifactSha256, rollbackAuthorization.authorizationNonceSha256, rollbackAuthorization.issuedAt, rollbackAuthorization.expiresAt],
    );
  });
  try {
    return await options.database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "rollback_t3_t0" }, async tx => {
    const operation = await tx.query("SELECT status,sealed_plan_sha256 FROM hr_yuzhou_production_import_operation WHERE operation_id=$1 FOR UPDATE", [plan.operationId]);
    if (operation?.rows?.length !== 1 || operation.rows[0].status !== "succeeded" || operation.rows[0].sealed_plan_sha256 !== plan.sealing.sealedPlanSha256) fail("PRODUCTION_IMPORT_ROLLBACK_STATE_INVALID", "operation is not the exact succeeded plan");
    await expectSingleStateTransition(
      tx,
      "UPDATE hr_yuzhou_production_import_rollback_operation SET status='running',started_at=now() WHERE rollback_operation_id=$1 AND status='authorized' RETURNING rollback_operation_id,status",
      [rollbackAuthorization.rollbackOperationId],
      "rollback running",
    );
    for (const phaseName of contract.rollbackOrder) {
      const phase = plan.phases.find(candidate => candidate.phase === phaseName);
      await expectSingleStateTransition(
        tx,
        "UPDATE hr_yuzhou_production_import_phase SET status='rolling_back',finished_at=NULL WHERE operation_id=$1 AND phase=$2 AND status='succeeded' RETURNING phase,status",
        [plan.operationId, phaseName],
        `${phaseName} rolling back`,
      );
      const plannedBySourceIdentity = new Map(phase.records.map(record => [record.sourceIdentitySha256, record]));
      const rollbackResults = await options.rollbackPhase({ tx, operationId: plan.operationId, phase: phaseName, records: structuredClone([...phase.records].reverse()) });
      if (!Array.isArray(rollbackResults) || rollbackResults.length !== phase.records.length) fail("PRODUCTION_IMPORT_ROLLBACK_RESULT_INVALID", `${phaseName} result count differs`);
      const statusUpdates = [];
      for (const result of rollbackResults) {
        const planned = plannedBySourceIdentity.get(result?.sourceIdentitySha256);
        if (!planned) fail("PRODUCTION_IMPORT_ROLLBACK_RESULT_INVALID", `${phaseName} source differs`);
        plannedBySourceIdentity.delete(result.sourceIdentitySha256);
        if (result?.sourceIdentitySha256 !== planned.sourceIdentitySha256) fail("PRODUCTION_IMPORT_ROLLBACK_RESULT_INVALID", `${phaseName} source differs`);
        const expectedStatus = { insert: "deleted_insert", merge: "restored_merge", quarantine: "quarantine_noop", skip_approved: "skip_noop" }[planned.disposition];
        if (result.rollbackStatus !== expectedStatus) fail("PRODUCTION_IMPORT_ROLLBACK_RESULT_INVALID", `${phaseName} status differs`);
        if (planned.disposition === "merge") {
          if (result.observedCurrentSha256 !== planned.expectedTargetAfterSha256 || result.restoredSha256 !== planned.expectedTargetBeforeSha256 || result.casApplied !== true) fail("PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED", `${phaseName} merge rollback did not CAS restore`);
        }
        statusUpdates.push({ source_identity_sha256: planned.sourceIdentitySha256, rollback_status: expectedStatus });
      }
      if (plannedBySourceIdentity.size !== 0) fail("PRODUCTION_IMPORT_ROLLBACK_RESULT_INVALID", `${phaseName} planned record absent from result`);
      for (const batch of batches(statusUpdates)) {
        const updated = await tx.query(
        `UPDATE hr_yuzhou_production_import_record AS record
         SET rollback_status=x.rollback_status,rolled_back_at=now()
         FROM jsonb_to_recordset($3::jsonb) AS x(source_identity_sha256 char(64),rollback_status varchar)
         WHERE record.operation_id=$1 AND record.phase=$2 AND record.source_identity_sha256=x.source_identity_sha256 AND record.rollback_status='not_started'
         RETURNING record.source_identity_sha256`,
        [plan.operationId, phaseName, JSON.stringify(batch)],
        );
        if (!updated || !Array.isArray(updated.rows) || updated.rows.length !== batch.length) fail("PRODUCTION_IMPORT_STATE_TRANSITION_FAILED", `${phaseName} rollback receipt affected ${updated?.rows?.length ?? "unknown"}/${batch.length} rows`);
      }
      await expectSingleStateTransition(tx,
        `UPDATE hr_yuzhou_production_import_phase SET status='rolled_back',rollback_canonical_sha256=before_canonical_sha256,finished_at=now()
         WHERE operation_id=$1 AND phase=$2 AND status='rolling_back'
         RETURNING phase,status`,
        [plan.operationId, phaseName],
        `${phaseName} rolled back`,
      );
    }
    const controlResidual = await tx.query(
      `SELECT
         (SELECT count(*)::int FROM hr_yuzhou_production_import_record WHERE operation_id=$1 AND rollback_status='not_started') AS not_started_count,
         (SELECT count(*)::int FROM hr_yuzhou_production_import_phase WHERE operation_id=$1 AND status='rolled_back') AS rolled_back_phase_count,
         (SELECT count(*)::int FROM hr_yuzhou_production_import_phase WHERE operation_id=$1) AS phase_count,
         (SELECT count(*)::int FROM legacy_record_map map
            JOIN hr_yuzhou_production_import_projection_receipt receipt ON receipt.legacy_record_map_id=map.id
           WHERE receipt.operation_id=$1 AND map.is_active) AS active_map_count,
         (SELECT count(*)::int FROM migration_batch WHERE execution_context='production_import'
            AND production_import_operation_id=$1 AND status='succeeded') AS succeeded_batch_count,
         (SELECT count(*)::int FROM migration_batch WHERE execution_context='production_import'
            AND production_import_operation_id=$1) AS batch_count`,
      [plan.operationId],
    );
    const control = controlResidual?.rows?.[0];
    if (!control || control.not_started_count !== 0 || control.rolled_back_phase_count !== 4 || control.phase_count !== 4 || control.active_map_count !== 0 || control.succeeded_batch_count !== 4 || control.batch_count !== 4) {
      fail("PRODUCTION_IMPORT_ROLLBACK_RESIDUAL", "control, phase, projection-map, or migration-batch residual differs");
    }
    const businessResidual = await options.verifyBusinessResiduals({
      tx,
      operationId: plan.operationId,
      targetScope: structuredClone(plan.targetScope),
      plan: structuredClone(plan),
    });
    if (!businessResidual || businessResidual.operationId !== plan.operationId || businessResidual.targetScopeSha256 !== plan.targetScope.scopeSha256 || businessResidual.residualCount !== 0) fail("PRODUCTION_IMPORT_BUSINESS_ROLLBACK_RESIDUAL", "business residual result is absent or unbound");
    assertSha(businessResidual.evidenceSha256, "businessResidual.evidenceSha256");
    await expectSingleStateTransition(
      tx,
      "UPDATE hr_yuzhou_production_import_rollback_operation SET status='succeeded',finished_at=now() WHERE rollback_operation_id=$1 AND status='running' RETURNING rollback_operation_id,status",
      [rollbackAuthorization.rollbackOperationId],
      "rollback succeeded",
    );
    return { operationId: plan.operationId, rollbackOperationId: rollbackAuthorization.rollbackOperationId, status: "rolled_back", residualCount: 0, businessResidualEvidenceSha256: businessResidual.evidenceSha256 };
  });
  } catch (error) {
    const failureCode = error instanceof ProductionImportExecutionError ? error.code : "PRODUCTION_IMPORT_ROLLBACK_TRANSACTION_FAILED";
    await options.database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "record_rollback_failure" }, async tx => {
      await expectSingleStateTransition(tx,
        "UPDATE hr_yuzhou_production_import_rollback_operation SET status='failed',failure_code=$2,finished_at=now() WHERE rollback_operation_id=$1 AND status='authorized' RETURNING rollback_operation_id,status",
        [rollbackAuthorization.rollbackOperationId, failureCode],
        "rollback failed",
      );
    });
    throw error;
  }
}
