import {
  DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT,
  ProductionImportExecutionError,
  assertProductionImportExecutionActivated,
  computeProductionImportApprovalSetHash,
  computeProductionImportPayloadBundleHash,
  productionImportHash,
  validateProductionImportPayloadBundle,
  validateProductionImportRollbackAuthorization,
  validateSealedProductionImportPlan,
} from "./production-import-sealed-plan-lib.mjs";

const fail = (code, detail) => { throw new ProductionImportExecutionError(code, detail); };
const asBuffer = (value, label) => {
  if (!Buffer.isBuffer(value) || value.length === 0) fail("PRODUCTION_IMPORT_WRITER_RESULT_INVALID", `${label} must be a non-empty Buffer`);
  return value;
};
const assertSha = (value, label) => { if (!/^[0-9a-f]{64}$/u.test(value ?? "")) fail("PRODUCTION_IMPORT_WRITER_RESULT_INVALID", `${label} invalid`); };

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

async function recordControlRows(tx, operationId, phase, result) {
  const resultBySourceIdentity = new Map(result.records.map(row => [row.sourceIdentitySha256, row]));
  for (const planned of phase.records) {
    const row = resultBySourceIdentity.get(planned.sourceIdentitySha256);
    await tx.query(
      `INSERT INTO hr_yuzhou_production_import_record(operation_id,phase,source_identity_sha256,source_row_sha256,owner_source_identity_sha256,disposition,planned_target_table,target_table,target_id,expected_target_before_sha256,target_after_sha256,decision_attestation_sha256)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [operationId, phase.phase, planned.sourceIdentitySha256, planned.sourceRowSha256, null, planned.disposition, planned.plannedTargetTable, planned.targetTable ?? null, row.targetId ?? null, planned.expectedTargetBeforeSha256 ?? null, row.targetAfterSha256 ?? null, planned.decisionAttestationSha256 ?? null],
    );
    for (const dependency of planned.dependencyRefs) {
      await tx.query(
        `INSERT INTO hr_yuzhou_production_import_record_dependency(operation_id,phase,source_identity_sha256,dependency_role,depends_on_phase,depends_on_source_identity_sha256,expected_target_table)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [operationId, phase.phase, planned.sourceIdentitySha256, dependency.role, dependency.phase, dependency.sourceIdentitySha256, dependency.expectedTargetTable],
      );
    }
    if (planned.disposition === "merge") {
      await tx.query(
        `INSERT INTO hr_yuzhou_production_import_before_image(operation_id,phase,source_identity_sha256,plaintext_sha256,ciphertext_sha256,key_reference_sha256,nonce,authentication_tag,ciphertext,algorithm)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [operationId, phase.phase, planned.sourceIdentitySha256, planned.beforeImage.plaintextSha256, planned.beforeImage.ciphertextSha256, planned.beforeImage.keyReferenceSha256, row.beforeImage.nonce, row.beforeImage.authenticationTag, row.beforeImage.ciphertext, planned.beforeImage.algorithm],
      );
    }
    if (planned.disposition === "quarantine") {
      await tx.query(
        `INSERT INTO hr_yuzhou_production_import_quarantine(operation_id,phase,source_identity_sha256,reason_code,algorithm,key_reference_sha256,nonce,authentication_tag,payload_ciphertext_sha256,payload_ciphertext,decision_attestation_sha256)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [operationId, phase.phase, planned.sourceIdentitySha256, planned.quarantine.reasonCode, planned.quarantine.algorithm, planned.quarantine.keyReferenceSha256, row.quarantineNonce, row.quarantineAuthenticationTag, planned.quarantine.payloadCiphertextSha256, row.quarantineCiphertext, planned.decisionAttestationSha256],
      );
    }
  }
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
    return await options.database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "apply_t0_t3" }, async tx => {
    if (!tx || typeof tx.query !== "function") fail("PRODUCTION_IMPORT_DATABASE_ADAPTER_REQUIRED", "transaction query adapter missing");
    await tx.query("SELECT hr_yuzhou_start_production_import($1,$2)", [plan.operationId, plan.sealing.sealedPlanSha256]);
    for (const phase of plan.phases) {
      await tx.query(
        `INSERT INTO hr_yuzhou_production_import_phase(operation_id,phase,phase_ordinal,status,source_batch_manifest_sha256,payload_bundle_artifact_sha256,payload_bundle_sha256,canonicalization_version,planned_record_count,before_canonical_sha256,started_at)
         VALUES($1,$2,$3,'running',$4,$5,$6,$7,$8,$9,$10,now())`,
        [plan.operationId, phase.phase, phase.ordinal, phase.sourceBatchManifestSha256, phase.payloadBundleArtifactSha256, phase.payloadBundleSha256, phase.canonicalizationVersion, phase.records.length, phase.beforeCanonicalSha256],
      );
      const result = validatePhaseResults(phase, plan.targetScope, await options.phaseWriters[phase.phase]({ tx, operationId: plan.operationId, targetScope: structuredClone(plan.targetScope), phase: structuredClone(phase), payloadBundle: structuredClone(payloadBundles.get(phase.phase)) }));
      await recordControlRows(tx, plan.operationId, phase, result);
      await tx.query(
        `UPDATE hr_yuzhou_production_import_phase SET status='succeeded',applied_record_count=$3,after_canonical_sha256=$4,finished_at=now()
         WHERE operation_id=$1 AND phase=$2 AND status='running'`,
        [plan.operationId, phase.phase, phase.records.length, result.afterCanonicalSha256],
      );
      await tx.query("UPDATE hr_yuzhou_production_import_operation SET current_phase=$2 WHERE operation_id=$1 AND status='running'", [plan.operationId, phase.phase]);
    }
    await tx.query("UPDATE hr_yuzhou_production_import_operation SET status='succeeded',finished_at=now() WHERE operation_id=$1 AND status='running'", [plan.operationId]);
    return { operationId: plan.operationId, status: "succeeded", phases: [...plan.phaseOrder], sealedPlanSha256: plan.sealing.sealedPlanSha256 };
  });
  } catch (error) {
    const failureCode = error instanceof ProductionImportExecutionError ? error.code : "PRODUCTION_IMPORT_BUSINESS_TRANSACTION_FAILED";
    await options.database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "record_import_failure" }, async tx => {
      await tx.query(
        "UPDATE hr_yuzhou_production_import_operation SET status='failed',failure_code=$2,finished_at=now() WHERE operation_id=$1 AND status='authorized'",
        [plan.operationId, failureCode],
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
  if (!options?.database || typeof options.database.transaction !== "function" || typeof options.rollbackRecord !== "function") fail("PRODUCTION_IMPORT_ROLLBACK_ADAPTER_REQUIRED", "rollback adapter missing");
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
    await tx.query("UPDATE hr_yuzhou_production_import_rollback_operation SET status='running',started_at=now() WHERE rollback_operation_id=$1 AND status='authorized'", [rollbackAuthorization.rollbackOperationId]);
    for (const phaseName of contract.rollbackOrder) {
      const phase = plan.phases.find(candidate => candidate.phase === phaseName);
      await tx.query("UPDATE hr_yuzhou_production_import_phase SET status='rolling_back',finished_at=NULL WHERE operation_id=$1 AND phase=$2 AND status='succeeded'", [plan.operationId, phaseName]);
      for (const planned of [...phase.records].reverse()) {
        const result = await options.rollbackRecord({ tx, operationId: plan.operationId, phase: phaseName, record: structuredClone(planned) });
        if (result?.sourceIdentitySha256 !== planned.sourceIdentitySha256) fail("PRODUCTION_IMPORT_ROLLBACK_RESULT_INVALID", `${phaseName} source differs`);
        const expectedStatus = { insert: "deleted_insert", merge: "restored_merge", quarantine: "quarantine_noop", skip_approved: "skip_noop" }[planned.disposition];
        if (result.rollbackStatus !== expectedStatus) fail("PRODUCTION_IMPORT_ROLLBACK_RESULT_INVALID", `${phaseName} status differs`);
        if (planned.disposition === "merge") {
          if (result.observedCurrentSha256 !== planned.expectedTargetAfterSha256 || result.restoredSha256 !== planned.expectedTargetBeforeSha256 || result.casApplied !== true) fail("PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED", `${phaseName} merge rollback did not CAS restore`);
        }
        await tx.query(
          `UPDATE hr_yuzhou_production_import_record SET rollback_status=$4,rolled_back_at=now()
           WHERE operation_id=$1 AND phase=$2 AND source_identity_sha256=$3 AND rollback_status='not_started'`,
          [plan.operationId, phaseName, planned.sourceIdentitySha256, expectedStatus],
        );
      }
      await tx.query(
        `UPDATE hr_yuzhou_production_import_phase SET status='rolled_back',rollback_canonical_sha256=before_canonical_sha256,finished_at=now()
         WHERE operation_id=$1 AND phase=$2 AND status='rolling_back'`,
        [plan.operationId, phaseName],
      );
    }
    const residual = await tx.query("SELECT count(*)::int AS count FROM hr_yuzhou_production_import_record WHERE operation_id=$1 AND rollback_status='not_started'", [plan.operationId]);
    if (residual?.rows?.[0]?.count !== 0) fail("PRODUCTION_IMPORT_ROLLBACK_RESIDUAL", String(residual?.rows?.[0]?.count));
    await tx.query("UPDATE hr_yuzhou_production_import_rollback_operation SET status='succeeded',finished_at=now() WHERE rollback_operation_id=$1 AND status='running'", [rollbackAuthorization.rollbackOperationId]);
    return { operationId: plan.operationId, rollbackOperationId: rollbackAuthorization.rollbackOperationId, status: "rolled_back", residualCount: 0 };
  });
  } catch (error) {
    const failureCode = error instanceof ProductionImportExecutionError ? error.code : "PRODUCTION_IMPORT_ROLLBACK_TRANSACTION_FAILED";
    await options.database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "record_rollback_failure" }, async tx => {
      await tx.query(
        "UPDATE hr_yuzhou_production_import_rollback_operation SET status='failed',failure_code=$2,finished_at=now() WHERE rollback_operation_id=$1 AND status='authorized'",
        [rollbackAuthorization.rollbackOperationId, failureCode],
      );
    });
    throw error;
  }
}
