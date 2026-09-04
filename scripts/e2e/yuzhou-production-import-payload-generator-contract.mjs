import assert from "node:assert/strict";

import {
  ProductionImportPayloadGenerationError,
  computeFrozenArtifactHash,
  generateProductionImportPayloads,
} from "../hr-cutover/production-import-payload-generator.mjs";
import { computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import {
  computeProductionImportBusinessIdentityHash,
  computeProductionImportTargetCanonicalHash,
} from "../hr-cutover/production-import-target-model.mjs";

const sha = character => character.repeat(64);
const targetScope = { tenantId: "10000001", parkId: "20000001" };
targetScope.scopeSha256 = computeProductionImportTargetScopeHash(targetScope);

const envelope = content => ({ artifactSha256: computeFrozenArtifactHash(content), content });
const sourceTables = {
  sys_org: "dbo.departmentcode", hr_position: "dbo.job", hr_employee: "dbo.person", hr_employment_event: "dbo.readjust",
  hr_contract_type: "dbo.compacttypecode", hr_contract: "dbo.compact", hr_contract_change: "dbo.compact_c", hr_contract_legacy_evidence: "dbo.compact",
  hr_attendance_import_batch: "dbo.timekeeptable", hr_attendance_symbol_rule: "dbo.timekeeptable", hr_attendance_calendar_source: "dbo.timekeeptable", hr_attendance_day: "dbo.timekeeptable",
  hr_insurance_policy: "dbo.insure_method", hr_insurance_policy_item: "dbo.insure_method", hr_employee_insurance_period: "dbo.person_insure", hr_employee_insurance_item: "dbo.person_insure",
};
const staged = (phase, targetTable, identity, row = identity) => ({ phase, targetTable, sourceSystem: "yuzhou-v10", sourceTable: sourceTables[targetTable], sourcePkCanonical: `sha256:${sha(identity)}`, sourceIdentitySha256: sha(identity), sourceRowSha256: sha(row) });
const dep = (role, phase, identity, expectedTargetTable) => ({ role, phase, sourceIdentitySha256: sha(identity), expectedTargetTable });
const decision = (phase, targetTable, identity, targetFields, dependencyRefs = [], disposition = "insert", extra = {}) => ({ phase, targetTable, sourceIdentitySha256: sha(identity), disposition, targetFields, dependencyRefs, ...extra });

const stagingContent = {
  formatVersion: 1,
  artifactKind: "yuzhou_hr_production_import_frozen_staging_index",
  sourceSnapshotHash: sha("f"),
  records: [
    staged("T0", "sys_org", "1"), staged("T0", "hr_position", "2"), staged("T0", "hr_employee", "3"),
    staged("T1", "hr_employment_event", "4"),
    staged("T2", "hr_contract_type", "5"), staged("T2", "hr_contract", "6"), staged("T2", "hr_contract_change", "7"), staged("T2", "hr_contract_legacy_evidence", "8"),
    staged("T3", "hr_attendance_import_batch", "9"), staged("T3", "hr_attendance_symbol_rule", "a"), staged("T3", "hr_attendance_calendar_source", "b"), staged("T3", "hr_attendance_day", "c"),
    staged("T3", "hr_insurance_policy", "d"), staged("T3", "hr_insurance_policy_item", "e"), staged("T3", "hr_employee_insurance_period", "0"), staged("T3", "hr_employee_insurance_item", "f"),
  ],
};
const stagingArtifact = envelope(stagingContent);
const inventoryContent = {
  formatVersion: 1,
  artifactKind: "yuzhou_hr_production_import_frozen_target_inventory",
  targetScope,
  records: [],
};
const targetInventoryArtifact = envelope(inventoryContent);
const sealedScopeContent = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_sealed_scope", targetScope };
const sealedScopeArtifact = envelope(sealedScopeContent);

const decisionsContent = {
  formatVersion: 1,
  artifactKind: "yuzhou_hr_production_import_frozen_decisions",
  stagingArtifactSha256: stagingArtifact.artifactSha256,
  targetInventoryArtifactSha256: targetInventoryArtifact.artifactSha256,
  sealedScopeArtifactSha256: sealedScopeArtifact.artifactSha256,
  phaseManifests: { T0: sha("1"), T1: sha("2"), T2: sha("3"), T3: sha("4") },
  records: [
    decision("T0", "sys_org", "1", { org_code: "000", org_name: "集团", org_type: "company", sort_order: 0, status: "enabled", remark: "legacy" }),
    decision("T0", "hr_position", "2", { position_code: "P01", position_name: "职员", job_family: null, job_level: null, headcount_limit: null, status: "enabled", remark: null }, [dep("org", "T0", "1", "sys_org")]),
    decision("T0", "hr_employee", "3", { employee_code: "E001", full_name: "冻结员工", employment_type: "full_time", employment_status: "active", hire_date: "2024-01-01", probation_end_date: null, departure_date: null, work_location: null, work_mobile: null, work_email: null, remark: null }, [dep("primary_org", "T0", "1", "sys_org"), dep("position", "T0", "2", "hr_position")]),
    decision("T1", "hr_employment_event", "4", { event_no: "L001", event_type: "transfer", effective_date: "2025-01-01", before_snapshot: {}, after_snapshot: {}, reason: null, status: "effective", legacy_event_no: "L001", legacy_event_type: "调动", legacy_state: "完成", source_effective_at: "2025-01-01T00:00:00.000Z", migration_decision: "accepted", is_historical_import: true, remark: null }, [dep("employee", "T0", "3", "hr_employee")]),
    decision("T2", "hr_contract_type", "5", { type_code: "FIXED", type_name: "固定期限", status: "enabled", is_historical_import: true, remark: null }),
    decision("T2", "hr_contract", "6", { contract_no: "C001", start_date: "2024-01-01", end_date: "2026-12-31", probation_end_date: null, status: "active", contract_term_months: 36, signature_date: "2024-01-01", effective_date: "2024-01-01", position_title: null, work_type: null, department_name_snapshot: null, first_signature_date: "2024-01-01", last_signature_date: "2024-01-01", cumulative_term_months: 36, renewal_count: 0, probation_months: null, probation_salary: "0.00", base_salary: "1000.00", confidentiality_agreement: false, non_compete_agreement: false, training_service_agreement: false, legacy_file_reference: null, legacy_text_present: false, is_historical_import: true, legacy_source_identity_sha256: sha("6"), legacy_source_row_sha256: sha("6"), source_snapshot: {}, remark: null }, [dep("employee", "T0", "3", "hr_employee"), dep("contract_type", "T2", "5", "hr_contract_type")]),
    decision("T2", "hr_contract_change", "7", { sequence_no: 1, change_type: "renewal", previous_start_date: null, previous_end_date: null, new_start_date: "2026-01-01", new_end_date: "2027-12-31", signed_at: null, is_historical_import: true, legacy_source_identity_sha256: sha("7"), legacy_source_row_sha256: sha("7"), source_snapshot: {}, remark: null }, [dep("contract", "T2", "6", "hr_contract")]),
    decision("T2", "hr_contract_legacy_evidence", "8", { evidence_kind: "controlled_text", locator_sha256: null, content_sha256: sha("8"), mime_type: null, size_bytes: 12, migration_status: "hashed_only", protected_file_id: null, missing_reason: null, source_identity_sha256: sha("8") }, [dep("contract", "T2", "6", "hr_contract")]),
    decision("T3", "hr_attendance_import_batch", "9", { batch_code: "T3", source_system: "yuzhou-v10", source_checksum: sha("9"), status: "imported", is_historical_import: true, remark: null }),
    decision("T3", "hr_attendance_symbol_rule", "a", { rule_version: "yuzhou-v1", legacy_symbol: "白班", normalized_kind: "standard_shift", effective_from: null, effective_to: null, status: "enabled", is_historical_import: true, remark: null }),
    decision("T3", "hr_attendance_calendar_source", "b", { legacy_id: 1, calendar_name: "一月", calendar_year: 2026, calendar_month: 1, source_snapshot: {}, remark: null }, [dep("import_batch", "T3", "9", "hr_attendance_import_batch")]),
    decision("T3", "hr_attendance_day", "c", { attendance_date: "2026-01-01", legacy_symbol: "白班", symbol_status: "mapped", normalized_kind: "standard_shift", is_historical_import: true, remark: null }, [dep("calendar_source", "T3", "b", "hr_attendance_calendar_source")]),
    decision("T3", "hr_insurance_policy", "d", { policy_code: "YUZHOU-1", policy_name: "历史政策", scope_description: null, status: "historical", is_historical_import: true, remark: null }),
    decision("T3", "hr_insurance_policy_item", "e", { insurance_kind: "pension", variant_no: 1, base_rate: "1.000000", employer_rate: "0.160000", employee_rate: "0.080000", supplement_rate: "0.000000", base_fixed_amount: "0.000", employer_fixed_amount: "6.000", employee_fixed_amount: "4.000", supplement_fixed_amount: null, source_snapshot: {}, remark: null }, [dep("policy", "T3", "d", "hr_insurance_policy")]),
    decision("T3", "hr_employee_insurance_period", "0", { period_year: 2026, period_month: 1, legacy_id: 1, status: "historical", needs_review: false, is_historical_import: true, source_snapshot: {}, remark: null }, [dep("employee", "T0", "3", "hr_employee")]),
    decision("T3", "hr_employee_insurance_item", "f", { insurance_kind: "pension", contribution_base: "1000.00", total_amount: "240.00", employer_amount: "160.00", employee_amount: "80.00", supplement_amount: "0.00", legacy_base_negative: false, remark: null }, [dep("period", "T3", "0", "hr_employee_insurance_period")]),
  ],
};
const decisionsArtifact = envelope(decisionsContent);
const input = { stagingArtifact, decisionsArtifact, targetInventoryArtifact, sealedScopeArtifact };

const generated = generateProductionImportPayloads(input);
assert.deepEqual(generated.phaseOrder, ["T0", "T1", "T2", "T3"]);
assert.equal(generated.bundles.length, 4);
assert.equal(generated.bundles.flatMap(row => row.bundle.records).length, 16);
assert.equal(generated.planPhases.flatMap(row => row.records).length, 16);
assert.ok(generated.planPhases.flatMap(row => row.records).every(row => /^[0-9a-f-]{36}$/u.test(row.targetId)));
assert.ok(generated.planPhases.flatMap(row => row.records).every(row => row.targetVersionAfter === 1 && row.expectedTargetVersionBefore === undefined), "insert starts at database version 1");
assert.ok(generated.planPhases.flatMap(row => row.records).every(row => row.sourceSystem === "yuzhou-v10" && /^dbo\./u.test(row.sourceTable) && row.sourcePkCanonical === `sha256:${row.sourceIdentitySha256}`));
assert.deepEqual(generated.sourceArtifacts, {
  stagingArtifactSha256: stagingArtifact.artifactSha256,
  decisionsArtifactSha256: decisionsArtifact.artifactSha256,
  targetInventoryArtifactSha256: targetInventoryArtifact.artifactSha256,
  sealedScopeArtifactSha256: sealedScopeArtifact.artifactSha256,
});
const employeePayload = generated.bundles[0].bundle.records.find(row => row.targetTable === "hr_employee").payload;
assert.equal("primary_org_id" in employeePayload, false, "FK is resolved only by dependency graph, not guessed into source payload");
assert.equal(generated.planPhases[0].records.find(row => row.plannedTargetTable === "hr_employee").dependencyRefs.length, 2);
assert.equal(generated.bundles[2].bundle.records.find(row => row.targetTable === "hr_contract").payload.base_salary, "1000.00");

const regenerated = generateProductionImportPayloads({ ...input, decisionsArtifact: envelope({ ...decisionsContent, records: [...decisionsContent.records].reverse() }) });
assert.deepEqual(regenerated.bundles, generated.bundles, "topological stable canonical output ignores approved decision ordering");
assert.deepEqual(regenerated.planPhases, generated.planPhases);

const orgPayload = decisionsContent.records[0].targetFields;
const orgBusinessIdentity = computeProductionImportBusinessIdentityHash("sys_org", targetScope, orgPayload);
const orgCanonical = computeProductionImportTargetCanonicalHash("sys_org", targetScope, orgPayload);
const existingOrgId = "11111111-1111-4111-8111-111111111111";
const skipInventoryArtifact = envelope({ ...inventoryContent, records: [{ targetTable: "sys_org", businessIdentitySha256: orgBusinessIdentity, targetId: existingOrgId, targetCanonicalSha256: orgCanonical, targetVersion: 7 }] });
const skipDecisionsArtifact = envelope({
  ...decisionsContent,
  targetInventoryArtifactSha256: skipInventoryArtifact.artifactSha256,
  records: decisionsContent.records.map((row, index) => index === 0 ? { ...row, disposition: "skip_approved", decisionAttestationSha256: sha("d"), expectedTargetVersionBefore: 7 } : row),
});
const skipped = generateProductionImportPayloads({ ...input, targetInventoryArtifact: skipInventoryArtifact, decisionsArtifact: skipDecisionsArtifact });
const skippedOrg = skipped.planPhases[0].records.find(row => row.plannedTargetTable === "sys_org");
assert.equal(skippedOrg.targetId, existingOrgId);
assert.equal(skippedOrg.expectedTargetBeforeSha256, orgCanonical);
assert.equal(skippedOrg.expectedTargetAfterSha256, orgCanonical);
assert.equal(skippedOrg.businessIdentitySha256, orgBusinessIdentity);
assert.equal(skippedOrg.expectedTargetVersionBefore, 7);
assert.equal(skippedOrg.targetVersionAfter, 7);

const mergeDecisionsArtifact = envelope({
  ...decisionsContent,
  targetInventoryArtifactSha256: skipInventoryArtifact.artifactSha256,
  records: decisionsContent.records.map((row, index) => index === 0 ? {
    ...row, disposition: "merge", decisionAttestationSha256: sha("d"), expectedTargetVersionBefore: 7,
    beforeImage: { algorithm: "aes-256-gcm-external-kek-v1", plaintextSha256: orgCanonical, ciphertextSha256: sha("c"), keyReferenceSha256: sha("e") },
  } : row),
});
const merged = generateProductionImportPayloads({ ...input, targetInventoryArtifact: skipInventoryArtifact, decisionsArtifact: mergeDecisionsArtifact });
const mergedOrg = merged.planPhases[0].records.find(row => row.plannedTargetTable === "sys_org");
assert.equal(mergedOrg.expectedTargetVersionBefore, 7);
assert.equal(mergedOrg.targetVersionAfter, 8);

const zeroVersionInventoryArtifact = envelope({ ...inventoryContent, records: [{ targetTable: "sys_org", businessIdentitySha256: orgBusinessIdentity, targetId: existingOrgId, targetCanonicalSha256: orgCanonical, targetVersion: 0 }] });
const zeroVersionDecisionsArtifact = envelope({
  ...decisionsContent,
  targetInventoryArtifactSha256: zeroVersionInventoryArtifact.artifactSha256,
  records: decisionsContent.records.map((row, index) => index === 0 ? { ...row, disposition: "skip_approved", decisionAttestationSha256: sha("d"), expectedTargetVersionBefore: 0 } : row),
});
const zeroVersionSkip = generateProductionImportPayloads({ ...input, targetInventoryArtifact: zeroVersionInventoryArtifact, decisionsArtifact: zeroVersionDecisionsArtifact });
assert.equal(zeroVersionSkip.planPhases[0].records[0].expectedTargetVersionBefore, 0, "target inventory contract accepts the required non-negative zero boundary");
assert.equal(zeroVersionSkip.planPhases[0].records[0].targetVersionAfter, 0);

const quarantineDecisionsArtifact = envelope({
  ...decisionsContent,
  records: decisionsContent.records.map((row, index) => index === 3 ? {
    ...row, disposition: "quarantine", decisionAttestationSha256: sha("d"),
    quarantine: { reasonCode: "EMPLOYMENT_EVENT_REVIEW", algorithm: "aes-256-gcm-external-kek-v1", payloadCiphertextSha256: sha("c"), keyReferenceSha256: sha("e") },
  } : row),
});
const quarantined = generateProductionImportPayloads({ ...input, decisionsArtifact: quarantineDecisionsArtifact });
const quarantinedEvent = quarantined.planPhases[1].records[0];
assert.equal(quarantinedEvent.targetVersionAfter, undefined);
assert.equal(quarantinedEvent.expectedTargetVersionBefore, undefined);
assert.equal(quarantinedEvent.targetId, undefined);

const expectCode = (mutate, code) => {
  assert.throws(() => generateProductionImportPayloads(mutate(structuredClone(input))), error => error instanceof ProductionImportPayloadGenerationError && error.code === code);
};
expectCode(value => { value.stagingArtifact.artifactSha256 = sha("e"); return value; }, "PRODUCTION_IMPORT_FROZEN_ARTIFACT_HASH_MISMATCH");
expectCode(value => { value.decisionsArtifact.content.records[2].targetFields.primary_org_id = "11111111-1111-4111-8111-111111111111"; value.decisionsArtifact = envelope(value.decisionsArtifact.content); return value; }, "PRODUCTION_IMPORT_TARGET_FIELD_DENIED");
expectCode(value => { value.decisionsArtifact.content.records[5].targetFields.base_salary = 1000; value.decisionsArtifact = envelope(value.decisionsArtifact.content); return value; }, "PRODUCTION_IMPORT_TARGET_FIELD_TYPE_INVALID");
expectCode(value => { value.decisionsArtifact.content.records[5].targetFields.base_salary = "-1.00"; value.decisionsArtifact = envelope(value.decisionsArtifact.content); return value; }, "PRODUCTION_IMPORT_TARGET_FIELD_TYPE_INVALID");
expectCode(value => { value.decisionsArtifact.content.records[2].dependencyRefs = []; value.decisionsArtifact = envelope(value.decisionsArtifact.content); return value; }, "PRODUCTION_IMPORT_DEPENDENCY_REQUIRED");
expectCode(value => { value.decisionsArtifact.content.records[1].dependencyRefs = [dep("org", "T3", "d", "sys_org")]; value.decisionsArtifact = envelope(value.decisionsArtifact.content); return value; }, "PRODUCTION_IMPORT_DEPENDENCY_INVALID");
expectCode(value => { value.decisionsArtifact.content.records[0].targetFields = { ...value.decisionsArtifact.content.records[0].targetFields, password: "forbidden" }; value.decisionsArtifact = envelope(value.decisionsArtifact.content); return value; }, "PRODUCTION_IMPORT_TARGET_FIELD_DENIED");
expectCode(value => { value.decisionsArtifact.content.records[3].sourceIdentitySha256 = sha("e"); value.decisionsArtifact = envelope(value.decisionsArtifact.content); return value; }, "PRODUCTION_IMPORT_STAGED_SOURCE_REQUIRED");
expectCode(value => { value.stagingArtifact.content.records[0].sourceSystem = "unknown"; value.stagingArtifact = envelope(value.stagingArtifact.content); value.decisionsArtifact.content.stagingArtifactSha256 = value.stagingArtifact.artifactSha256; value.decisionsArtifact = envelope(value.decisionsArtifact.content); return value; }, "PRODUCTION_IMPORT_SOURCE_PROVENANCE_INVALID");
expectCode(value => { value.stagingArtifact.content.records[0].sourceTable = "dbo.person"; value.stagingArtifact = envelope(value.stagingArtifact.content); value.decisionsArtifact.content.stagingArtifactSha256 = value.stagingArtifact.artifactSha256; value.decisionsArtifact = envelope(value.decisionsArtifact.content); return value; }, "PRODUCTION_IMPORT_SOURCE_PROVENANCE_INVALID");
expectCode(value => { value.stagingArtifact.content.records[0].sourcePkCanonical = "department=董事长"; value.stagingArtifact = envelope(value.stagingArtifact.content); value.decisionsArtifact.content.stagingArtifactSha256 = value.stagingArtifact.artifactSha256; value.decisionsArtifact = envelope(value.decisionsArtifact.content); return value; }, "PRODUCTION_IMPORT_SOURCE_PROVENANCE_INVALID");
expectCode(value => { value.targetInventoryArtifact = skipInventoryArtifact; value.decisionsArtifact.content.targetInventoryArtifactSha256 = skipInventoryArtifact.artifactSha256; value.decisionsArtifact = envelope(value.decisionsArtifact.content); return value; }, "PRODUCTION_IMPORT_TARGET_COLLISION");
expectCode(value => {
  value.targetInventoryArtifact = skipInventoryArtifact;
  value.decisionsArtifact.content.targetInventoryArtifactSha256 = skipInventoryArtifact.artifactSha256;
  value.decisionsArtifact.content.records[0] = { ...value.decisionsArtifact.content.records[0], disposition: "skip_approved", decisionAttestationSha256: sha("d"), expectedTargetVersionBefore: 7, targetFields: { ...value.decisionsArtifact.content.records[0].targetFields, org_name: "CAS漂移" } };
  value.decisionsArtifact = envelope(value.decisionsArtifact.content);
  return value;
}, "PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED");
expectCode(value => {
  value.targetInventoryArtifact = envelope({ ...inventoryContent, records: [{ targetTable: "sys_org", businessIdentitySha256: orgBusinessIdentity, targetId: existingOrgId, targetCanonicalSha256: orgCanonical }] });
  value.decisionsArtifact.content.targetInventoryArtifactSha256 = value.targetInventoryArtifact.artifactSha256;
  value.decisionsArtifact = envelope(value.decisionsArtifact.content);
  return value;
}, "PRODUCTION_IMPORT_TARGET_INVENTORY_INVALID");
expectCode(value => {
  value.targetInventoryArtifact = envelope({ ...inventoryContent, records: [{ targetTable: "sys_org", businessIdentitySha256: orgBusinessIdentity, targetId: existingOrgId, targetCanonicalSha256: orgCanonical, targetVersion: -1 }] });
  value.decisionsArtifact.content.targetInventoryArtifactSha256 = value.targetInventoryArtifact.artifactSha256;
  value.decisionsArtifact = envelope(value.decisionsArtifact.content);
  return value;
}, "PRODUCTION_IMPORT_TARGET_INVENTORY_INVALID");
expectCode(value => {
  value.targetInventoryArtifact = skipInventoryArtifact;
  value.decisionsArtifact.content.targetInventoryArtifactSha256 = skipInventoryArtifact.artifactSha256;
  value.decisionsArtifact.content.records[0] = { ...value.decisionsArtifact.content.records[0], disposition: "skip_approved", decisionAttestationSha256: sha("d"), expectedTargetVersionBefore: 6 };
  value.decisionsArtifact = envelope(value.decisionsArtifact.content);
  return value;
}, "PRODUCTION_IMPORT_TARGET_VERSION_PRECONDITION_FAILED");
expectCode(value => {
  value.targetInventoryArtifact = skipInventoryArtifact;
  value.decisionsArtifact.content.targetInventoryArtifactSha256 = skipInventoryArtifact.artifactSha256;
  value.decisionsArtifact.content.records[0] = { ...value.decisionsArtifact.content.records[0], disposition: "skip_approved", decisionAttestationSha256: sha("d") };
  value.decisionsArtifact = envelope(value.decisionsArtifact.content);
  return value;
}, "PRODUCTION_IMPORT_TARGET_VERSION_PRECONDITION_FAILED");
expectCode(value => {
  value.targetInventoryArtifact = envelope({ ...inventoryContent, records: [{ targetTable: "sys_org", businessIdentitySha256: orgBusinessIdentity, targetId: existingOrgId, targetCanonicalSha256: orgCanonical, targetVersion: Number.MAX_SAFE_INTEGER }] });
  value.decisionsArtifact.content.targetInventoryArtifactSha256 = value.targetInventoryArtifact.artifactSha256;
  value.decisionsArtifact.content.records[0] = {
    ...value.decisionsArtifact.content.records[0], disposition: "merge", decisionAttestationSha256: sha("d"), expectedTargetVersionBefore: Number.MAX_SAFE_INTEGER,
    beforeImage: { algorithm: "aes-256-gcm-external-kek-v1", plaintextSha256: orgCanonical, ciphertextSha256: sha("c"), keyReferenceSha256: sha("e") },
  };
  value.decisionsArtifact = envelope(value.decisionsArtifact.content);
  return value;
}, "PRODUCTION_IMPORT_TARGET_VERSION_OVERFLOW");

console.log("Yuzhou production import payload-generator contract passed: frozen-only, 16 target tables, no FK/name guessing, exact decimal/CAS output");
