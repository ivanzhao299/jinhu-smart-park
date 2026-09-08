/* global Buffer, structuredClone */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT, computeProductionImportPayloadHash, computeProductionImportTargetScopeHash, computeSealedProductionImportPlanHash, productionImportHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, computeProductionImportBusinessIdentityHash, computeProductionImportTargetCanonicalHash, deriveProductionImportTargetId } from "../hr-cutover/production-import-target-model.mjs";
import { buildProductionImportPlanPhase } from "../hr-cutover/production-import-plan-phase-builder.mjs";
const PHASES = ["T0", "T1", "T2", "T3"];
const H = value => createHash("sha256").update(String(value)).digest("hex");
const iso = date => date.toISOString();

function payloadFor(table, suffix, sourceIdentitySha256, protectedFileId) {
  const sharedDate = "2026-08-29";
  const timestamp = "2026-08-29T09:10:11.000";
  const values = {
    sys_org: { org_code: `ORG-${suffix}`, org_name: `Lab Org ${suffix}`, org_type: "department", sort_order: 1, status: "enabled", remark: null, contact_phone: "", planned_headcount: 0, legacy_source_id: 101 },
    hr_position: { position_code: `POS-${suffix}`, position_name: `Lab Position ${suffix}`, job_family: null, job_level: "L1", headcount_limit: 2, status: "enabled", remark: null, authority: "权限说明", legacy_source_id: 102, legacy_upto_code: "ROOT", position_manual: "  ", qualification: null, responsibilities: "岗位职责" },
    hr_employee: { employee_code: `EMP-${suffix}`, full_name: `Lab Employee ${suffix}`, employment_type: "full_time", employment_status: "active", hire_date: sharedDate, probation_end_date: null, departure_date: null, work_location: "Lab", work_mobile: null, work_email: null, remark: null },
    hr_employment_event: { event_no: `EVT-${suffix}`, event_type: "onboard", effective_date: sharedDate, before_snapshot: {}, after_snapshot: { state: "active" }, reason: "legacy import", status: "effective", legacy_event_no: `LEG-EVT-${suffix}`, legacy_event_type: "入职", legacy_state: "已生效", source_effective_at: `${timestamp}000+08:00`, migration_decision: "accepted", is_historical_import: true, remark: null },
    hr_contract_type: { type_code: `TYPE-${suffix}`, type_name: `Lab Type ${suffix}`, status: "enabled", is_historical_import: true, remark: null },
    hr_contract: { contract_no: `CON-${suffix}`, start_date: sharedDate, end_date: "2027-08-28", probation_end_date: null, status: "active", contract_term_months: 12, signature_date: sharedDate, effective_date: sharedDate, position_title: "Lab", work_type: "full_time", department_name_snapshot: "Lab Org", first_signature_date: sharedDate, last_signature_date: sharedDate, cumulative_term_months: 12, renewal_count: 0, probation_months: null, probation_salary: null, base_salary: "1000.01", confidentiality_agreement: false, non_compete_agreement: false, training_service_agreement: false, legacy_file_reference: null, legacy_text_present: false, is_historical_import: true, legacy_source_identity_sha256: sourceIdentitySha256, legacy_source_row_sha256: H(`${suffix}:contract-row`), source_snapshot: { source: "fixed-lab" }, remark: null },
    hr_contract_change: { sequence_no: 1, change_type: "renewal", previous_start_date: null, previous_end_date: null, new_start_date: sharedDate, new_end_date: "2027-08-28", signed_at: timestamp, is_historical_import: true, legacy_source_identity_sha256: sourceIdentitySha256, legacy_source_row_sha256: H(`${suffix}:change-row`), source_snapshot: { source: "fixed-lab" }, remark: null },
    hr_contract_legacy_evidence: { evidence_kind: "file_manifest", locator_sha256: H(`${suffix}:locator`), content_sha256: H(`${suffix}:content`), mime_type: "application/pdf", size_bytes: 9223372036854775806n, migration_status: "migrated", protected_file_id: protectedFileId, missing_reason: null, source_identity_sha256: sourceIdentitySha256 },
    hr_attendance_import_batch: { batch_code: `ATT-${suffix}`, source_system: "yuzhou-v10", source_checksum: H(`${suffix}:attendance`), status: "imported", is_historical_import: true, remark: null },
    hr_attendance_symbol_rule: { rule_version: `v-${suffix}`, legacy_symbol: "√", normalized_kind: "present", effective_from: sharedDate, effective_to: null, status: "enabled", is_historical_import: true, remark: null },
    hr_attendance_calendar_source: { legacy_id: 1, calendar_name: `Calendar ${suffix}`, calendar_year: 2026, calendar_month: 8, source_snapshot: { source: "fixed-lab" }, remark: null },
    hr_attendance_day: { attendance_date: sharedDate, legacy_symbol: "√", symbol_status: "mapped", normalized_kind: "present", is_historical_import: true, remark: null },
    hr_insurance_policy: { policy_code: `POL-${suffix}`, policy_name: `Policy ${suffix}`, scope_description: "Lab only", status: "historical", is_historical_import: true, remark: null },
    hr_insurance_policy_item: { insurance_kind: "pension", variant_no: 1, base_rate: "0.080000", employer_rate: "0.160000", employee_rate: "0.080000", supplement_rate: null, base_fixed_amount: null, employer_fixed_amount: null, employee_fixed_amount: null, supplement_fixed_amount: null, source_snapshot: { source: "fixed-lab" }, remark: null },
    hr_employee_insurance_period: { period_year: 2026, period_month: 8, legacy_id: 1, status: "historical", needs_review: false, is_historical_import: true, source_snapshot: { source: "fixed-lab" }, remark: null },
    hr_employee_insurance_item: { insurance_kind: "pension", contribution_base: "1000.01", total_amount: "240.00", employer_amount: "160.00", employee_amount: "80.00", supplement_amount: null, legacy_base_negative: false, remark: null },
  };
  const payload = values[table];
  assert.ok(payload, `missing fixture payload for ${table}`);
  return JSON.parse(JSON.stringify(payload, (_key, value) => typeof value === "bigint" ? value.toString() : value));
}

function dependency(role, record) {
  return { role, phase: record.phase, sourceIdentitySha256: record.sourceIdentitySha256, expectedTargetTable: record.plannedTargetTable };
}

export function makeFixture(iteration, now, employeeOptions = {}, labDatabase = "synthetic-schema-free") {
  assert.ok(Object.keys(employeeOptions).every(key => ["employeeCode", "employeeSourceIdentitySha256"].includes(key)));
  const customEmployee = Object.keys(employeeOptions).length > 0;
  if (customEmployee) {
    assert.equal(typeof employeeOptions.employeeCode, "string");
    assert.ok(employeeOptions.employeeCode.length > 0 && employeeOptions.employeeCode.length <= 64);
    assert.match(employeeOptions.employeeSourceIdentitySha256, /^[0-9a-f]{64}$/u);
  }
  const suffix = randomBytes(6).toString("hex");
  const operationId = `yzprod-import-${iso(now).replaceAll(/[-:.]/gu, "").slice(0, 15)}Z-${suffix}`;
  const targetScope = { tenantId: randomUUID(), parkId: randomUUID(), scopeSha256: "" };
  targetScope.scopeSha256 = computeProductionImportTargetScopeHash(targetScope);
  const target = { environment: "production", alias: `lab-${suffix}`, identitySha256: H(`${suffix}:target:${labDatabase}`) };
  const triple = { codeSha: H(`${suffix}:code`).slice(0, 40), sourceSnapshotHash: H(`${suffix}:source`), mappingContractHash: H(`${suffix}:mapping`) };
  const records = [];
  const protectedFileId = randomUUID();
  let ordinal = 0;
  const add = (table, dependencyMode, dependencyRefs, disposition = "insert", payloadOverride = undefined, sourceIdentityOverride = undefined) => {
    const rule = model.targetTables[table];
    const sourceIdentitySha256 = sourceIdentityOverride ?? H(`${suffix}:${table}:${ordinal}:identity`);
    const sourceRowSha256 = H(`${suffix}:${table}:${ordinal}:row`);
    const payload = payloadOverride ?? payloadFor(table, suffix, sourceIdentitySha256, protectedFileId);
    const derivedFields = Object.fromEntries(rule.derivedFields.map(field => {
      const foreignKey = rule.foreignKeys.find(candidate => candidate.column === field);
      const reference = dependencyRefs.find(candidate => candidate.role === foreignKey?.dependencyRole);
      return [field, reference ? records.find(candidate => candidate.sourceIdentitySha256 === reference.sourceIdentitySha256)?.targetId ?? null : null];
    }));
    const targetId = disposition === "quarantine"
      ? undefined
      : disposition === "insert"
        ? deriveProductionImportTargetId({ targetScope, targetTable: table, sourceIdentitySha256 })
        : randomUUID();
    const record = {
      phase: rule.phase,
      payload,
      sourceSystem: model.sourceSystem,
      sourceTable: rule.allowedSourceTables[0],
      sourcePkCanonical: `sha256:${sourceIdentitySha256}`,
      sourceIdentitySha256,
      sourceRowSha256,
      payloadSha256: computeProductionImportPayloadHash(payload),
      plannedTargetTable: table,
      dependencyMode,
      dependencyRefs,
      disposition,
    };
    if (disposition !== "quarantine") {
      Object.assign(record, {
        targetTable: table,
        targetId,
        businessIdentitySha256: computeProductionImportBusinessIdentityHash(table, targetScope, payload, derivedFields),
        expectedTargetAfterSha256: computeProductionImportTargetCanonicalHash(table, targetScope, payload, derivedFields),
        targetVersionAfter: 1,
      });
    }
    records.push(record);
    ordinal += 1;
    return record;
  };

  const orgBeforePayload = payloadFor("sys_org", `${suffix}-before`, H("unused"), protectedFileId);
  const orgAfterPayload = { ...orgBeforePayload, org_name: `Lab Org ${suffix} merged`, contact_phone: "  ", planned_headcount: 7, legacy_source_id: 202 };
  const org = add("sys_org", "scope", [], "merge", orgAfterPayload);
  org.expectedTargetBeforeSha256 = computeProductionImportTargetCanonicalHash("sys_org", targetScope, orgBeforePayload, { parent_id: null });
  org.expectedTargetVersionBefore = 3;
  org.targetVersionAfter = 4;
  org.decisionAttestationSha256 = H(`${suffix}:org-merge-decision`);
  const orgBefore = { payload: orgBeforePayload, derivedFields: { parent_id: null }, version: 3, canonicalSha256: org.expectedTargetBeforeSha256 };
  const orgCiphertext = Buffer.from(JSON.stringify(orgBefore));
  org.beforeImage = { algorithm: "aes-256-gcm-external-kek-v1", plaintextSha256: org.expectedTargetBeforeSha256, ciphertextSha256: H(orgCiphertext), keyReferenceSha256: H(`${suffix}:before-key`) };
  const position = add("hr_position", "record_graph", [dependency("org", org)]);
  const employeePayload = customEmployee ? {
    ...payloadFor("hr_employee", suffix, employeeOptions.employeeSourceIdentitySha256, protectedFileId),
    employee_code: employeeOptions.employeeCode,
  } : undefined;
  const employee = add("hr_employee", "record_graph", [dependency("primary_org", org), dependency("position", position)],
    "insert", employeePayload, employeeOptions.employeeSourceIdentitySha256);
  add("hr_employment_event", "employee", [dependency("employee", employee)]);
  const contractType = add("hr_contract_type", "scope", [], "skip_approved");
  contractType.expectedTargetBeforeSha256 = contractType.expectedTargetAfterSha256;
  contractType.expectedTargetVersionBefore = 1;
  contractType.targetVersionAfter = 1;
  contractType.decisionAttestationSha256 = H(`${suffix}:type-skip-decision`);
  const contract = add("hr_contract", "record_graph", [dependency("employee", employee), dependency("contract_type", contractType)]);
  add("hr_contract_change", "record_graph", [dependency("contract", contract)]);
  add("hr_contract_legacy_evidence", "record_graph", [dependency("contract", contract)]);
  const attendanceBatch = add("hr_attendance_import_batch", "scope", []);
  add("hr_attendance_symbol_rule", "scope", []);
  const quarantinePayload = { legacy_symbol: "?" };
  const quarantined = add("hr_attendance_symbol_rule", "scope", [], "quarantine", quarantinePayload);
  const quarantineCiphertext = Buffer.from(JSON.stringify(quarantinePayload));
  quarantined.decisionAttestationSha256 = H(`${suffix}:symbol-quarantine-decision`);
  quarantined.quarantine = { reasonCode: "LEGACY_SYMBOL_REVIEW", algorithm: "aes-256-gcm-external-kek-v1", payloadCiphertextSha256: H(quarantineCiphertext), keyReferenceSha256: H(`${suffix}:quarantine-key`) };
  const calendar = add("hr_attendance_calendar_source", "record_graph", [dependency("import_batch", attendanceBatch)]);
  add("hr_attendance_day", "record_graph", [dependency("calendar_source", calendar)]);
  const policy = add("hr_insurance_policy", "scope", []);
  add("hr_insurance_policy_item", "record_graph", [dependency("policy", policy)]);
  const insurancePeriod = add("hr_employee_insurance_period", "employee", [dependency("employee", employee)]);
  add("hr_employee_insurance_item", "record_graph", [dependency("period", insurancePeriod)]);

  const byPhase = Object.fromEntries(PHASES.map(phase => [phase, records.filter(record => record.phase === phase)]));
  const payloadBundles = {};
  const phases = PHASES.map((phaseName, phaseOrdinal) => {
    const sourceBatchManifestSha256 = H(`${suffix}:${phaseName}:manifest`);
    const bundle = {
      formatVersion: 2,
      artifactKind: "yuzhou_hr_production_import_payload_bundle",
      phase: phaseName,
      targetScope: structuredClone(targetScope),
      canonicalizationVersion: DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.canonicalizationVersion,
      sourceBatchManifestSha256,
      records: byPhase[phaseName].map(record => ({ sourceIdentitySha256: record.sourceIdentitySha256, sourceRowSha256: record.sourceRowSha256, targetTable: record.plannedTargetTable, payloadSha256: record.payloadSha256, payload: record.payload })),
    };
    const artifact = Buffer.from(JSON.stringify(bundle));
    payloadBundles[phaseName] = artifact;
    const planned = byPhase[phaseName].map(({ phase: _phase, payload: _payload, ...record }) => { void _phase; void _payload; return record; });
    const baselineRows = byPhase[phaseName].filter(record => ["merge", "skip_approved"].includes(record.disposition)).map(record => ({
      targetTable: record.targetTable, targetId: record.targetId, version: record.expectedTargetVersionBefore,
      payload: record === org ? orgBeforePayload : record.payload,
      derivedFields: record === org ? { parent_id: null } : {},
    }));
    const built = buildProductionImportPlanPhase({ phase: { phase: phaseName, ordinal: phaseOrdinal, sourceBatchManifestSha256, records: planned },
      payloadBundle: bundle, targetScope, baseline: { targetScope, rows: baselineRows },
      dependencyTargets: records.filter(record => PHASES.indexOf(record.phase) < phaseOrdinal) });
    return { ...built, payloadBundleArtifactSha256: productionImportHash(artifact) };
  });
  const startsAt = iso(new Date(now.getTime() - 60_000));
  const endsAt = iso(new Date(now.getTime() + 30 * 60_000));
  const issuedAt = iso(new Date(now.getTime() - 30_000));
  const expiresAt = iso(new Date(now.getTime() + 20 * 60_000));
  const manifestSha256 = computeProductionImportPayloadHash({ triple, target, targetScope, phases });
  const pairSha256 = H(`${suffix}:pair`);
  const plan = {
    formatVersion: 2, planKind: "yuzhou_hr_production_import_sealed_execution_plan", operationId, intent: "production_import", status: "SEALED",
    triple, target, targetScope, window: { startsAt, endsAt },
    authorization: {
      intent: "production_import", artifactSha256: H(`${suffix}:auth`), nonceSha256: H(`${suffix}:auth-nonce`), issuedAt, expiresAt,
      binding: { triple, targetIdentitySha256: target.identitySha256, targetScopeSha256: targetScope.scopeSha256, finalRehearsalPairSha256: pairSha256, manifestSha256, windowStartsAt: startsAt, windowEndsAt: endsAt },
      approvalSet: ["hr_owner", "data_security_owner", "release_owner"].map(role => ({ role, subjectRefSha256: H(`${suffix}:${role}:subject`), signedDecisionSha256: H(`${suffix}:${role}:decision`) })),
    },
    manifestSha256,
    finalRehearsalPair: { artifactSha256: pairSha256, triple, rehearsals: ["A", "B"].map(label => ({ rehearsal: label, manifestSha256: H(`${suffix}:${label}:manifest`), cleanupAuditSha256: H(`${suffix}:${label}:cleanup`), residualCount: 0 })) },
    phaseOrder: PHASES, phases,
    rollback: { order: [...PHASES].reverse(), insert: "delete_operation_owned_target", merge: "encrypted_before_image_cas_restore", quarantine: "no_target_write", skipApproved: "no_target_write", residualCount: 0, canonicalHash: "EXACT" },
    sealing: { algorithm: "canonical-json-sha256-v1", sealedPlanSha256: H("placeholder") }, productionImport: "HOLD",
  };
  plan.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(plan);
  const rollbackAuthorization = {
    formatVersion: 1, artifactKind: "yuzhou_hr_production_import_rollback_authorization", intent: "production_import_rollback",
    rollbackOperationId: `yzprod-rollback-${iso(now).replaceAll(/[-:.]/gu, "").slice(0, 15)}Z-${randomBytes(6).toString("hex")}`,
    importOperationId: operationId, sealedPlanSha256: plan.sealing.sealedPlanSha256, targetIdentitySha256: target.identitySha256,
    authorizationArtifactSha256: H(`${suffix}:rollback-auth`), authorizationNonceSha256: H(`${suffix}:rollback-nonce`), issuedAt, expiresAt, productionImport: "HOLD",
  };
  return { iteration, suffix, targetScope, plan, payloadBundles, rollbackAuthorization, records, org, orgBeforePayload, contractType, protectedFileId, orgCiphertext, quarantineCiphertext };
}
