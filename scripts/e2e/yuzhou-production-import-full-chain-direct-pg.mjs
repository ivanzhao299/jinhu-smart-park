#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

import pg from "pg";

import {
  DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT,
  computeProductionImportPayloadBundleHash,
  computeProductionImportPayloadHash,
  computeProductionImportTargetScopeHash,
  computeSealedProductionImportPlanHash,
  productionImportHash,
} from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { createProductionImportPhaseWriters } from "../hr-cutover/production-import-phase-writers.mjs";
import { createProductionImportPhaseRollback } from "../hr-cutover/production-import-phase-rollback.mjs";
import { createProductionImportPostgresAdapter } from "../hr-cutover/production-import-postgres-adapter.mjs";
import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL,
  computeProductionImportBusinessIdentityHash,
  computeProductionImportTargetCanonicalHash,
  deriveProductionImportTargetId,
} from "../hr-cutover/production-import-target-model.mjs";
import { executeSealedProductionImport, rollbackSealedProductionImport } from "../hr-cutover/production-import-writer.mjs";

const { Pool } = pg;
const PHASES = ["T0", "T1", "T2", "T3"];
const TABLES = Object.keys(DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables);
const LAB_DATABASE = process.env.YUZHOU_TARGET_DATABASE ?? "";
const LAB_HOST = process.env.YUZHOU_LAB_PG_HOST ?? "";
const LAB_PORT = Number(process.env.YUZHOU_LAB_PG_PORT ?? "0");
const LAB_USER = process.env.YUZHOU_LAB_PG_USER ?? "";
const LAB_PASSWORD = process.env.YUZHOU_LAB_PG_PASSWORD ?? "";
const LAB_CONTAINER = process.env.YUZHOU_POSTGRES_CONTAINER ?? "";
const LAB_COMPOSE_PROJECT = process.env.YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT ?? "";

assert.match(LAB_DATABASE, /^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u, "an explicit isolated lab database is required");
assert.ok(["127.0.0.1", "::1", "localhost"].includes(LAB_HOST), "the PostgreSQL host must be loopback");
assert.ok(Number.isSafeInteger(LAB_PORT) && LAB_PORT >= 1024 && LAB_PORT <= 65535, "an explicit loopback lab port is required");
assert.match(LAB_USER, /^[A-Za-z0-9_]{1,63}$/u, "an explicit lab database user is required");
assert.ok(LAB_PASSWORD.length > 0, "an explicit lab database password is required");
assert.match(LAB_CONTAINER, /^[A-Za-z0-9][A-Za-z0-9_.-]{2,127}$/u, "an explicit local PostgreSQL container is required");
assert.match(LAB_COMPOSE_PROJECT, /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/u, "an explicit local Compose project is required");
// The shared release-smoke compose file has a historical fixed container name
// containing "prod" even though its unique Compose project is disposable CI.
// Bind isolation to the observed Compose project label; an actual production
// project remains forbidden regardless of the container's cosmetic name.
assert.doesNotMatch(LAB_COMPOSE_PROJECT, /(?:^|[-_])prod(?:uction)?(?:$|[-_])/iu, "a production-labelled Compose project is forbidden");
const inspect = spawnSync("docker", ["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', LAB_CONTAINER], { encoding: "utf8" });
assert.equal(inspect.status, 0, "the explicit lab PostgreSQL container must exist");
assert.equal(inspect.stdout.trim(), LAB_COMPOSE_PROJECT, "the PostgreSQL container must belong to the explicit lab Compose project");

const H = value => createHash("sha256").update(String(value)).digest("hex");
const iso = date => date.toISOString();
const model = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL;
const pool = new Pool({ host: LAB_HOST, port: LAB_PORT, user: LAB_USER, password: LAB_PASSWORD, database: LAB_DATABASE, max: 2 });

function activatedContract(plan) {
  const contract = structuredClone(DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT);
  contract.activation = { status: "PASS", allowedTargets: [{ ...structuredClone(plan.target), targetScopeSha256: plan.targetScope.scopeSha256 }], reasonCodes: [] };
  contract.productionImport = "READY";
  return contract;
}

function payloadFor(table, suffix, sourceIdentitySha256, protectedFileId) {
  const sharedDate = "2026-08-29";
  const timestamp = "2026-08-29T09:10:11.000";
  const values = {
    sys_org: { org_code: `ORG-${suffix}`, org_name: `Lab Org ${suffix}`, org_type: "department", sort_order: 1, status: "enabled", remark: null },
    hr_position: { position_code: `POS-${suffix}`, position_name: `Lab Position ${suffix}`, job_family: null, job_level: "L1", headcount_limit: 2, status: "enabled", remark: null },
    hr_employee: { employee_code: `EMP-${suffix}`, full_name: `Lab Employee ${suffix}`, employment_type: "full_time", employment_status: "active", hire_date: sharedDate, probation_end_date: null, departure_date: null, work_location: "Lab", work_mobile: null, work_email: null, remark: null },
    hr_employment_event: { event_no: `EVT-${suffix}`, event_type: "onboard", effective_date: sharedDate, before_snapshot: {}, after_snapshot: { state: "active" }, reason: "legacy import", status: "effective", legacy_event_no: `LEG-EVT-${suffix}`, legacy_event_type: "入职", legacy_state: "已生效", source_effective_at: timestamp, migration_decision: "accepted", is_historical_import: true, remark: null },
    hr_contract_type: { type_code: `TYPE-${suffix}`, type_name: `Lab Type ${suffix}`, status: "enabled", is_historical_import: true, remark: null },
    hr_contract: { contract_no: `CON-${suffix}`, start_date: sharedDate, end_date: "2027-08-28", probation_end_date: null, status: "active", contract_term_months: 12, signature_date: sharedDate, effective_date: sharedDate, position_title: "Lab", work_type: "full_time", department_name_snapshot: "Lab Org", first_signature_date: sharedDate, last_signature_date: sharedDate, cumulative_term_months: 12, renewal_count: 0, probation_months: null, probation_salary: null, base_salary: "1000.01", confidentiality_agreement: false, non_compete_agreement: false, training_service_agreement: false, legacy_file_reference: null, legacy_text_present: false, is_historical_import: true, legacy_source_identity_sha256: sourceIdentitySha256, legacy_source_row_sha256: H(`${suffix}:contract-row`), source_snapshot: { source: "fixed-lab" }, remark: null },
    hr_contract_change: { sequence_no: 1, change_type: "renewal", previous_start_date: null, previous_end_date: null, new_start_date: sharedDate, new_end_date: "2027-08-28", signed_at: timestamp, is_historical_import: true, legacy_source_identity_sha256: sourceIdentitySha256, legacy_source_row_sha256: H(`${suffix}:change-row`), source_snapshot: { source: "fixed-lab" }, remark: null },
    hr_contract_legacy_evidence: { evidence_kind: "file_manifest", locator_sha256: H(`${suffix}:locator`), content_sha256: H(`${suffix}:content`), mime_type: "application/pdf", size_bytes: 9223372036854775806n, migration_status: "migrated", protected_file_id: protectedFileId, missing_reason: null, source_identity_sha256: sourceIdentitySha256 },
    hr_attendance_import_batch: { batch_code: `ATT-${suffix}`, source_system: "yuzhou-v10", source_checksum: H(`${suffix}:attendance`), status: "imported", is_historical_import: true, remark: null },
    hr_attendance_symbol_rule: { rule_version: `v-${suffix}`, legacy_symbol: "√", normalized_kind: "present", effective_from: sharedDate, effective_to: null, status: "enabled", is_historical_import: true, remark: null },
    hr_attendance_calendar_source: { legacy_id: 1, calendar_name: `Calendar ${suffix}`, calendar_year: 2026, calendar_month: 8, source_snapshot: { source: "fixed-lab" }, remark: null },
    hr_attendance_day: { attendance_date: sharedDate, legacy_symbol: "√", symbol_status: "mapped", normalized_kind: "present", is_historical_import: true, remark: null },
    hr_insurance_policy: { policy_code: `POL-${suffix}`, policy_name: `Policy ${suffix}`, scope_description: "Lab only", status: "historical", is_historical_import: true, remark: null },
    hr_insurance_policy_item: { insurance_kind: "pension", variant_no: 1, base_rate: "0.080000", employer_rate: "0.160000", employee_rate: "0.080000", supplement_rate: null, source_snapshot: { source: "fixed-lab" }, remark: null },
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

function makeFixture(iteration, now) {
  const suffix = randomBytes(6).toString("hex");
  const operationId = `yzprod-import-${iso(now).replaceAll(/[-:.]/gu, "").slice(0, 15)}Z-${suffix}`;
  const targetScope = { tenantId: randomUUID(), parkId: randomUUID(), scopeSha256: "" };
  targetScope.scopeSha256 = computeProductionImportTargetScopeHash(targetScope);
  const target = { environment: "production", alias: `lab-${suffix}`, identitySha256: H(`${suffix}:target:${LAB_DATABASE}`) };
  const triple = { codeSha: H(`${suffix}:code`).slice(0, 40), sourceSnapshotHash: H(`${suffix}:source`), mappingContractHash: H(`${suffix}:mapping`) };
  const records = [];
  const protectedFileId = randomUUID();
  let ordinal = 0;
  const add = (table, dependencyMode, dependencyRefs, disposition = "insert", payloadOverride = undefined) => {
    const rule = model.targetTables[table];
    const sourceIdentitySha256 = H(`${suffix}:${table}:${ordinal}:identity`);
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
  const orgAfterPayload = { ...orgBeforePayload, org_name: `Lab Org ${suffix} merged` };
  const org = add("sys_org", "scope", [], "merge", orgAfterPayload);
  org.expectedTargetBeforeSha256 = computeProductionImportTargetCanonicalHash("sys_org", targetScope, orgBeforePayload, { parent_id: null });
  org.expectedTargetVersionBefore = 3;
  org.targetVersionAfter = 4;
  org.decisionAttestationSha256 = H(`${suffix}:org-merge-decision`);
  const orgBefore = { payload: orgBeforePayload, derivedFields: { parent_id: null }, version: 3, canonicalSha256: org.expectedTargetBeforeSha256 };
  const orgCiphertext = Buffer.from(JSON.stringify(orgBefore));
  org.beforeImage = { algorithm: "aes-256-gcm-external-kek-v1", plaintextSha256: org.expectedTargetBeforeSha256, ciphertextSha256: H(orgCiphertext), keyReferenceSha256: H(`${suffix}:before-key`) };
  const position = add("hr_position", "record_graph", [dependency("org", org)]);
  const employee = add("hr_employee", "record_graph", [dependency("primary_org", org), dependency("position", position)]);
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
    return {
      phase: phaseName,
      ordinal: phaseOrdinal,
      sourceBatchManifestSha256,
      payloadBundleArtifactSha256: productionImportHash(artifact),
      payloadBundleSha256: computeProductionImportPayloadBundleHash(bundle),
      canonicalizationVersion: bundle.canonicalizationVersion,
      beforeCanonicalSha256: H(`${suffix}:${phaseName}:before`),
      expectedAfterCanonicalSha256: H(`${suffix}:${phaseName}:after`),
      records: byPhase[phaseName].map(({ phase: _phase, payload: _payload, ...record }) => record),
    };
  });
  const startsAt = iso(new Date(now.getTime() - 60_000));
  const endsAt = iso(new Date(now.getTime() + 30 * 60_000));
  const issuedAt = iso(new Date(now.getTime() - 30_000));
  const expiresAt = iso(new Date(now.getTime() + 20 * 60_000));
  const manifestSha256 = H(`${suffix}:parent-manifest`);
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

async function seedExisting(client, fixture) {
  await client.query(
    `INSERT INTO sys_org(id,tenant_id,park_id,parent_id,org_code,org_name,org_type,sort_order,status,remark,version)
     VALUES($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9,3)`,
    [fixture.org.targetId, fixture.targetScope.tenantId, fixture.targetScope.parkId, ...Object.values(fixture.orgBeforePayload)],
  );
  const payload = fixture.records.find(record => record.plannedTargetTable === "hr_contract_type").payload;
  await client.query(
    `INSERT INTO hr_contract_type(id,tenant_id,park_id,type_code,type_name,status,is_historical_import,remark,version)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,1)`,
    [fixture.contractType.targetId, fixture.targetScope.tenantId, fixture.targetScope.parkId, payload.type_code, payload.type_name, payload.status, payload.is_historical_import, payload.remark],
  );
}

async function verifyApplied(client, fixture) {
  const counts = await client.query(
    `SELECT
       (SELECT count(*)::int FROM hr_yuzhou_production_import_record WHERE operation_id=$1) AS controls,
       (SELECT count(*)::int FROM hr_yuzhou_production_import_projection_receipt WHERE operation_id=$1) AS receipts,
       (SELECT count(*)::int FROM migration_batch WHERE production_import_operation_id=$1 AND status='succeeded') AS batches,
       (SELECT count(*)::int FROM legacy_record_map map JOIN migration_batch batch ON batch.id=map.batch_id WHERE batch.production_import_operation_id=$1 AND map.is_active) AS active_maps`,
    [fixture.plan.operationId],
  );
  assert.deepEqual(counts.rows[0], { controls: 17, receipts: 17, batches: 4, active_maps: 17 });
  for (const table of TABLES) {
    const expected = fixture.records.filter(record => record.plannedTargetTable === table && record.disposition !== "quarantine").length;
    const result = await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE tenant_id=$1 AND park_id=$2`, [fixture.targetScope.tenantId, fixture.targetScope.parkId]);
    assert.equal(result.rows[0].count, expected, `${table} applied count`);
  }
  for (const record of fixture.records) {
    if (record.disposition === "quarantine") continue;
    const rule = model.targetTables[record.plannedTargetTable];
    const columns = [...rule.fieldWhitelist, ...rule.derivedFields];
    const current = (await client.query(`SELECT ${columns.join(",")} FROM ${record.plannedTargetTable} WHERE id=$1`, [record.targetId])).rows[0];
    const payload = Object.fromEntries(rule.fieldWhitelist.map(field => {
      let value = current[field];
      if (value !== null && value !== undefined && record.plannedTargetTable === "hr_contract_legacy_evidence" && field === "size_bytes") value = String(value);
      else if (value !== null && value !== undefined && rule.integerFields.includes(field)) value = Number(value);
      if (value !== null && value !== undefined && rule.decimalStringFields.includes(field)) value = String(value);
      if (value instanceof Date && rule.dateFields.includes(field)) value = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
      if (value instanceof Date && ["hr_employment_event", "hr_contract_change"].includes(record.plannedTargetTable) && ["source_effective_at", "signed_at"].includes(field)) value = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}T${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:${String(value.getSeconds()).padStart(2, "0")}.${String(value.getMilliseconds()).padStart(3, "0")}`;
      if (value instanceof Date && rule.timestampFields.includes(field)) value = value.toISOString();
      return [field, value];
    }));
    const derived = Object.fromEntries(rule.derivedFields.map(field => [field, current[field] === null ? null : String(current[field])]));
    const observed = computeProductionImportTargetCanonicalHash(record.plannedTargetTable, fixture.targetScope, payload, derived);
    assert.equal(observed, record.expectedTargetAfterSha256, `${record.plannedTargetTable} applied canonical hash`);
  }
  const evidence = await client.query("SELECT protected_file_id::text,size_bytes::text FROM hr_contract_legacy_evidence WHERE tenant_id=$1 AND park_id=$2", [fixture.targetScope.tenantId, fixture.targetScope.parkId]);
  assert.deepEqual(evidence.rows, [{ protected_file_id: fixture.protectedFileId, size_bytes: "9223372036854775806" }]);
  const timestamps = await client.query("SELECT source_effective_at::text AS event_at,signed_at::text AS signed_at FROM hr_employment_event CROSS JOIN hr_contract_change WHERE hr_employment_event.tenant_id=$1 AND hr_employment_event.park_id=$2 AND hr_contract_change.tenant_id=$1 AND hr_contract_change.park_id=$2", [fixture.targetScope.tenantId, fixture.targetScope.parkId]);
  assert.equal(timestamps.rows.length, 1);
  assert.match(timestamps.rows[0].event_at, /^2026-08-29 09:10:11/u);
  assert.match(timestamps.rows[0].signed_at, /^2026-08-29 09:10:11/u);
}

async function verifyRolledBack(client, fixture) {
  for (const record of fixture.records) {
    if (record.disposition === "insert") {
      const result = await client.query(`SELECT count(*)::int AS count FROM ${record.plannedTargetTable} WHERE id=$1`, [record.targetId]);
      assert.equal(result.rows[0].count, 0, `${record.plannedTargetTable} inserted row removed`);
    }
  }
  const org = await client.query("SELECT org_name,version FROM sys_org WHERE id=$1", [fixture.org.targetId]);
  assert.deepEqual(org.rows, [{ org_name: fixture.orgBeforePayload.org_name, version: 3 }]);
  const preserved = await client.query("SELECT count(*)::int AS count,version FROM hr_contract_type WHERE id=$1 GROUP BY version", [fixture.contractType.targetId]);
  assert.deepEqual(preserved.rows, [{ count: 1, version: 1 }]);
  const residual = await client.query(
    `SELECT
       (SELECT count(*)::int FROM legacy_record_map map JOIN migration_batch batch ON batch.id=map.batch_id WHERE batch.production_import_operation_id=$1 AND map.is_active) AS active_maps,
       (SELECT count(*)::int FROM hr_yuzhou_production_import_record WHERE operation_id=$1 AND rollback_status='not_started') AS controls_not_rolled_back,
       (SELECT count(*)::int FROM hr_yuzhou_production_import_phase WHERE operation_id=$1 AND status<>'rolled_back') AS phases_not_rolled_back,
       (SELECT count(*)::int FROM hr_yuzhou_production_import_rollback_operation WHERE import_operation_id=$1 AND status='succeeded') AS rollback_succeeded`,
    [fixture.plan.operationId],
  );
  assert.deepEqual(residual.rows[0], { active_maps: 0, controls_not_rolled_back: 0, phases_not_rolled_back: 0, rollback_succeeded: 1 });
}

async function cleanupFixture(client, fixture) {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    for (const table of [
      "hr_employee_insurance_item", "hr_employee_insurance_period", "hr_insurance_policy_item", "hr_insurance_policy",
      "hr_attendance_day", "hr_attendance_calendar_source", "hr_attendance_symbol_rule", "hr_attendance_import_batch",
      "hr_contract_legacy_evidence", "hr_contract_change", "hr_contract", "hr_contract_type", "hr_employment_event",
      "hr_employee", "hr_position", "sys_org",
    ]) await client.query(`DELETE FROM ${table} WHERE tenant_id=$1 AND park_id=$2`, [fixture.targetScope.tenantId, fixture.targetScope.parkId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_projection_receipt WHERE operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM legacy_record_map WHERE batch_id IN (SELECT id FROM migration_batch WHERE production_import_operation_id=$1)", [fixture.plan.operationId]);
    await client.query("DELETE FROM migration_batch_item WHERE batch_id IN (SELECT id FROM migration_batch WHERE production_import_operation_id=$1)", [fixture.plan.operationId]);
    await client.query("DELETE FROM migration_batch WHERE production_import_operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_record_dependency WHERE operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_before_image WHERE operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_quarantine WHERE operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_record WHERE operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_phase WHERE operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_authorization_use WHERE import_operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_rollback_operation WHERE import_operation_id=$1", [fixture.plan.operationId]);
    await client.query("DELETE FROM hr_yuzhou_production_import_operation WHERE operation_id=$1", [fixture.plan.operationId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  const residual = await client.query(
    `SELECT
      (SELECT count(*) FROM hr_yuzhou_production_import_operation WHERE operation_id=$1)+
      (SELECT count(*) FROM hr_yuzhou_production_import_projection_receipt WHERE operation_id=$1)+
      (SELECT count(*) FROM migration_batch WHERE production_import_operation_id=$1)+
      (SELECT count(*) FROM sys_org WHERE id=$2)+
      (SELECT count(*) FROM hr_contract_type WHERE id=$3) AS count`,
    [fixture.plan.operationId, fixture.org.targetId, fixture.contractType.targetId],
  );
  assert.equal(Number(residual.rows[0].count), 0, "fixture cleanup residual must be zero");
}

async function runIteration(iteration) {
  const now = new Date();
  const fixture = makeFixture(iteration, now);
  const client = await pool.connect();
  let adapter;
  try {
    const preflight = await client.query("SELECT current_database() AS database,current_user AS username,inet_server_addr()::text AS server_address,inet_server_port()::integer AS server_port,(pg_control_system()).system_identifier::text AS system_identifier,to_regclass('public.hr_yuzhou_production_import_projection_receipt') IS NOT NULL AS has_receipts");
    assert.equal(preflight.rows.length, 1);
    assert.equal(preflight.rows[0].database, LAB_DATABASE);
    assert.equal(preflight.rows[0].username, LAB_USER);
    assert.equal(preflight.rows[0].has_receipts, true);
    await seedExisting(client, fixture);
    const cryptoProvider = {
      async encryptBeforeImage({ targetBefore }) {
        const ciphertext = Buffer.from(JSON.stringify(targetBefore));
        assert.equal(H(ciphertext), fixture.org.beforeImage.ciphertextSha256);
        return { ciphertext, nonce: randomBytes(12), authenticationTag: randomBytes(16) };
      },
      async encryptQuarantine({ payload }) {
        const ciphertext = Buffer.from(JSON.stringify(payload));
        assert.equal(H(ciphertext), fixture.records.find(record => record.disposition === "quarantine").quarantine.payloadCiphertextSha256);
        return { ciphertext, nonce: randomBytes(12), authenticationTag: randomBytes(16) };
      },
      async decryptBeforeImage({ envelope }) {
        return { plaintextSha256: fixture.org.expectedTargetBeforeSha256, targetBefore: JSON.parse(envelope.ciphertext.toString("utf8")) };
      },
    };
    adapter = createProductionImportPostgresAdapter({
      pool,
      ownership: "borrowed",
      binding: {
        database: LAB_DATABASE,
        databaseUser: LAB_USER,
        targetIdentitySha256: fixture.plan.target.identitySha256,
        targetScope: fixture.targetScope,
        serverIdentity: { address: preflight.rows[0].server_address, port: preflight.rows[0].server_port, systemIdentifier: preflight.rows[0].system_identifier },
      },
    });
    const contract = activatedContract(fixture.plan);
    const phaseWriters = createProductionImportPhaseWriters({ cryptoProvider });
    const applied = await executeSealedProductionImport(fixture.plan, {
      contract, now, currentCodeSha: fixture.plan.triple.codeSha, mergedCodeSha: fixture.plan.triple.codeSha,
      targetIdentitySha256: fixture.plan.target.identitySha256, targetScope: fixture.targetScope,
      database: adapter, payloadBundles: fixture.payloadBundles, phaseWriters,
    });
    assert.equal(applied.status, "succeeded");
    await verifyApplied(client, fixture);
    const rollback = await rollbackSealedProductionImport(fixture.plan, fixture.rollbackAuthorization, {
      contract, now, currentCodeSha: fixture.plan.triple.codeSha, mergedCodeSha: fixture.plan.triple.codeSha,
      targetIdentitySha256: fixture.plan.target.identitySha256, targetScope: fixture.targetScope,
      database: adapter, rollbackPhase: createProductionImportPhaseRollback({ cryptoProvider }),
      verifyBusinessResiduals: async ({ tx, operationId, targetScope, plan }) => {
        let residualCount = 0;
        for (const phase of plan.phases) for (const record of phase.records) {
          if (record.disposition !== "insert") continue;
          const result = await tx.query(`SELECT count(*)::int AS count FROM ${record.plannedTargetTable} WHERE tenant_id=$1 AND park_id=$2 AND id=$3`, [targetScope.tenantId, targetScope.parkId, record.targetId]);
          residualCount += result.rows[0].count;
        }
        return { operationId, targetScopeSha256: targetScope.scopeSha256, residualCount, evidenceSha256: H(`${operationId}:${targetScope.scopeSha256}:business-residual:${residualCount}`) };
      },
    });
    assert.equal(rollback.operationId, fixture.plan.operationId);
    assert.equal(rollback.rollbackOperationId, fixture.rollbackAuthorization.rollbackOperationId);
    assert.equal(rollback.status, "rolled_back");
    assert.equal(rollback.residualCount, 0);
    assert.match(rollback.businessResidualEvidenceSha256, /^[0-9a-f]{64}$/u);
    await verifyRolledBack(client, fixture);
  } finally {
    if (adapter) await adapter.close();
    try {
      await cleanupFixture(client, fixture);
    } finally {
      client.release();
    }
  }
}

try {
  await runIteration(1);
  await runIteration(2);
  console.log("Production import full-chain PostgreSQL fixture passed twice: 16 tables, T0-T3, maps/control/canonical, insert/merge/skip/quarantine, reverse rollback, residual=0");
} finally {
  await pool.end();
}
