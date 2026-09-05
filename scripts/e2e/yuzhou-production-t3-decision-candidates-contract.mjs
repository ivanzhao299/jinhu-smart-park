/* global structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { assembleProductionT3DecisionCandidates as assemble, ProductionT3CandidatesError } from "../hr-cutover/production-t3-decision-candidates.mjs";
import { projectProductionT3Fields as project, buildProductionT3AttendanceSupport as support } from "../hr-cutover/production-t3-field-projection.mjs";
import { recoverProductionT3LegacyPolicy as recover } from "../hr-cutover/production-t3-policy-recovery.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, stableProductionImportCanonicalJson as canonical,
  computeProductionImportBusinessIdentityHash as businessHash, computeProductionImportTargetCanonicalHash as targetHash,
  deriveProductionImportTargetId as deriveId } from "../hr-cutover/production-import-target-model.mjs";
import { computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const tables = Object.keys(model.targetTables).filter(table => model.targetTables[table].phase === "T3");
const kinds = ["oldage", "remedy", "losework", "fund", "wound", "bear"];
const provenanceKeys = ["phase", "targetTable", "sourceSystem", "sourceTable", "sourcePkCanonical", "sourceIdentitySha256", "sourceRowSha256"];
const provenance = row => Object.fromEntries(provenanceKeys.map(key => [key, row[key]]));
function staged(sourceTable, source, children) {
  return { sourceTable, sourceKey: String(source.id), sourceIdentitySha256: hash(`${sourceTable}\0${source.id}`),
    sourceRowSha256: hash(`synthetic pretransform ${sourceTable} ${source.id}`), source, ...children };
}
function calendar(id = 101) {
  return staged("dbo.timekeeptable", { id, calendarName: "Synthetic calendar", year: 2024, month: 2 },
    { days: [{ day: 1, legacySymbol: "普通班次" }, { day: 2, legacySymbol: "晚上班" }, { day: 3, legacySymbol: null }] });
}
function policy() {
  return staged("dbo.insure_method", { id: 201, name: "Synthetic policy", scope: null }, { items: kinds.map(kind => ({ kind, variant: 1,
    baseRate: "0.16", employerRate: "0", employeeRate: null, supplementRate: "0.000001",
    baseFixedAmount: "1.234", employerFixedAmount: "0", employeeFixedAmount: null, supplementFixedAmount: "2.3" })) });
}
function oldPolicy(id = 501) {
  const raw = { id, des: "Synthetic recovered policy", rightscope: "0" };
  const slots = [["baseRate", ""], ["employerRate", "_e"], ["employeeRate", "_p"], ["supplementRate", "_pc"]];
  for (const kind of kinds) for (const [, suffix] of slots) { raw[`${kind}${suffix}`] = "16.000"; raw[`${kind}${suffix}2`] = "12.345"; }
  return { ...staged("dbo.insure_method", { id, name: raw.des, scope: raw.rightscope }, {}), sourceRowSha256: hash(canonical(raw)),
    items: kinds.flatMap(kind => [1, 2].map(variant => ({ kind, variant,
      ...Object.fromEntries(slots.map(([field, suffix]) => [field, raw[`${kind}${suffix}${variant === 2 ? "2" : ""}`]])) }))) };
}
function insurance(id = 301, employeeCode = "SYN-E1") {
  return staged("dbo.person_insure", { id, year: "2024", month: "2", employeeCode }, { items: kinds.map(kind => ({ kind,
    contributionBase: "100", totalAmount: "16.5", employerAmount: "0", employeeAmount: null, supplementAmount: "0.00",
    legacyBaseNegative: false, legacyFlag: null })) });
}
function t0row(table, sourceTable, code, fields, scope, parents = []) {
  const identity = hash(`${sourceTable}\0${code}`);
  const derived = Object.fromEntries(parents.map(([role, parent]) => [model.targetTables[table].foreignKeys.find(fk => fk.dependencyRole === role).column, parent.expectedTargetId]));
  return { phase: "T0", targetTable: table, sourceSystem: "yuzhou-v10", sourceTable, sourcePkCanonical: `sha256:${identity}`, sourceIdentitySha256: identity,
    sourceRowSha256: hash(`synthetic ${code}`), candidateDisposition: "insert", reasonCode: null, targetFields: fields,
    dependencyRefs: parents.map(([role, parent]) => ({ role, phase: "T0", sourceIdentitySha256: parent.sourceIdentitySha256, expectedTargetTable: parent.targetTable })),
    businessIdentitySha256: businessHash(table, scope, fields, derived), expectedTargetId: deriveId({ targetScope: scope, targetTable: table, sourceIdentitySha256: identity }),
    expectedTargetVersion: null, expectedTargetCanonicalSha256: null };
}
function fixture() {
  const triple = { codeSha: "a".repeat(40), sourceSnapshotHash: hash("source"), mappingContractHash: hash("mapping") };
  const scope = { tenantId: "synthetic-tenant", parkId: "synthetic-park" }; scope.scopeSha256 = computeProductionImportTargetScopeHash(scope);
  const org = t0row("sys_org", "dbo.departmentcode", "SYN-ORG", { org_code: "SYN-ORG", org_name: "Synthetic org", org_type: "department", sort_order: 0, status: "enabled", remark: null }, scope);
  const employee = t0row("hr_employee", "dbo.person", "SYN-E1", { employee_code: "SYN-E1", full_name: "Synthetic employee", employment_type: "full_time", employment_status: "active",
    hire_date: null, probation_end_date: null, departure_date: null, work_location: null, work_mobile: null, work_email: null, remark: null }, scope, [["primary_org", org]]);
  const inventory = { formatVersion: 1, kind: "yuzhou_hr_production_target_inventory_readonly", status: "PASS", productionImport: "HOLD", executionReachable: false,
    targetIdentitySha256: hash("target"), targetScopeSha256: scope.scopeSha256, sourceManifestSha256: hash("manifest"), triple: { ...triple },
    targetTableCounts: Object.fromEntries(Object.keys(model.targetTables).map(table => [table, 0])), records: [] };
  const artifactHashes = { targetInventoryArtifactSha256: hash("inventory bytes"), t0CandidatesArtifactSha256: hash("t0 bytes") };
  const t0Candidates = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_t0_decision_candidates", triple: { ...triple }, phaseArtifactSha256: hash("t0phase"),
    targetInventoryArtifactSha256: artifactHashes.targetInventoryArtifactSha256, targetIdentitySha256: inventory.targetIdentitySha256, targetScope: { ...scope },
    jobStateDecisionArtifactSha256: hash("jobstate"), status: "READY_FOR_FREEZE", countByDisposition: { insert: 2, skip_exact: 0, review_target_collision: 0, quarantine: 0 },
    records: [org, employee], productionImport: "HOLD" };
  return { triple, targetScope: scope, targetInventory: inventory, t0Candidates, artifactHashes,
    attendanceFileSha256: hash("synthetic attendance bytes"), stagedRecords: [calendar(), policy(), insurance()] };
}
const rows = (out, table) => out.candidates.records.filter(row => row.targetTable === table);
const rejects = (input, code) => assert.throws(() => assemble(input), error => error instanceof ProductionT3CandidatesError && error.code === code && error.message === code);
function derivedFor(input, output, row) {
  return Object.fromEntries(row.dependencyRefs.map(ref => {
    const parent = [...input.t0Candidates.records, ...output.candidates.records].find(item => item.sourceIdentitySha256 === ref.sourceIdentitySha256);
    return [model.targetTables[row.targetTable].foreignKeys.find(fk => fk.dependencyRole === ref.role).column, parent.expectedTargetId];
  }));
}
function inventoryEntry(input, output, row, overrides = {}) {
  const entry = { targetTable: row.targetTable, businessIdentitySha256: row.businessIdentitySha256, targetId: row.expectedTargetId,
    targetCanonicalSha256: targetHash(row.targetTable, input.targetScope, row.targetFields, derivedFor(input, output, row)), targetVersion: 3, ...overrides };
  input.targetInventory.records.push(entry); input.targetInventory.targetTableCounts[row.targetTable]++; return entry;
}
function freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }

test("all eight model tables have complete fields, exact FK targets, canonical business identities and one shared phase", () => {
  const input = fixture(), out = assemble(input), c = out.candidates;
  assert.equal(c.status, "READY_FOR_REVIEW"); assert.equal(c.productionImport, "HOLD");
  assert.deepEqual(c.targetTableCounts, { hr_attendance_import_batch: 1, hr_attendance_symbol_rule: 2, hr_attendance_calendar_source: 1, hr_attendance_day: 3,
    hr_insurance_policy: 1, hr_insurance_policy_item: 6, hr_employee_insurance_period: 1, hr_employee_insurance_item: 6 });
  assert.equal(c.countByDisposition.insert, 21); assert.equal(c.records.length, 21);
  const expected = new Map([...support([input.stagedRecords[0]], input.attendanceFileSha256), ...input.stagedRecords.flatMap(row => project(row, { attendanceFileSha256: input.attendanceFileSha256 }))].map(row => [row.sourceIdentitySha256, row]));
  for (const row of c.records) {
    const rule = model.targetTables[row.targetTable];
    assert.deepEqual(row.targetFields, expected.get(row.sourceIdentitySha256).targetFields);
    assert.deepEqual(Object.keys(row.targetFields).sort(), [...rule.fieldWhitelist].sort());
    assert.deepEqual(row.dependencyRefs.map(ref => ref.role), rule.foreignKeys.map(fk => fk.dependencyRole));
    assert.equal(row.businessIdentitySha256, businessHash(row.targetTable, input.targetScope, row.targetFields, derivedFor(input, out, row)));
    assert.equal(row.expectedTargetId, deriveId({ targetScope: input.targetScope, targetTable: row.targetTable, sourceIdentitySha256: row.sourceIdentitySha256 }));
    for (const ref of row.dependencyRefs) {
      const parent = ref.phase === "T0" ? input.t0Candidates.records.find(r => r.sourceIdentitySha256 === ref.sourceIdentitySha256) : c.records.find(r => r.sourceIdentitySha256 === ref.sourceIdentitySha256);
      assert.equal(parent.targetTable, ref.expectedTargetTable);
      if (ref.phase === "T3") assert.ok(tables.indexOf(parent.targetTable) < tables.indexOf(row.targetTable));
    }
  }
  assert.deepEqual(out.phaseArtifact.records, c.records.map(provenance));
  assert.equal(c.phaseArtifactSha256, hash(`${canonical(out.phaseArtifact)}\n`));
  assert.notEqual(c.phaseArtifactSha256, hash(canonical(out.phaseArtifact)));
  assert.equal(rows(out, "hr_attendance_import_batch")[0].targetFields.status, "imported");
  assert.equal(rows(out, "hr_insurance_policy_item")[0].targetFields.base_rate, "0.160000");
  assert.equal(rows(out, "hr_employee_insurance_item")[0].targetFields.total_amount, "16.50");
});

test("old twelve-item policies become six normalized phase and candidate rows with exact lineage, never old aliases", () => {
  const input = fixture(); input.stagedRecords[1] = oldPolicy();
  const out = assemble(input), expected = recover(input.stagedRecords[1]);
  assert.deepEqual(out.policyRecoveries, [{ proof: expected.proof, lineage: expected.lineage }]);
  assert.equal(out.candidates.targetTableCounts.hr_insurance_policy_item, 6);
  assert.equal(out.phaseArtifact.targetTableCounts.hr_insurance_policy_item, 6);
  for (const link of out.policyRecoveries[0].lineage) {
    assert.deepEqual(out.phaseArtifact.records.find(row => row.sourceIdentitySha256 === link.targetProjection.sourceIdentitySha256), link.targetProjection);
    assert.ok(!out.phaseArtifact.records.some(row => row.sourceIdentitySha256 === link.sourceProjections[1].sourceIdentitySha256));
    assert.ok(!out.candidates.records.some(row => row.sourceIdentitySha256 === link.sourceProjections[1].sourceIdentitySha256));
  }
  assert.ok(rows(out, "hr_insurance_policy_item").every(row => row.targetFields.base_rate === "0.160000" && row.targetFields.base_fixed_amount === "12.345"));
  assert.equal(out.candidates.phaseArtifactSha256, hash(`${canonical(out.phaseArtifact)}\n`));
  const oldPhase = { ...out.phaseArtifact, records: [...out.phaseArtifact.records.filter(row => row.targetTable !== "hr_insurance_policy_item"), ...project(input.stagedRecords[1]).slice(1).map(provenance)] };
  assert.notEqual(out.candidates.phaseArtifactSha256, hash(`${canonical(oldPhase)}\n`));
  assert.deepEqual(out.phaseArtifact.records, out.candidates.records.map(provenance));
});

test("current policies are not divided twice; empty input retains one batch and all seven zero-count tables", () => {
  const input = fixture(), current = assemble(input); assert.deepEqual(current.policyRecoveries, []);
  input.stagedRecords = []; const out = assemble(input);
  assert.deepEqual(out.candidates.targetTableCounts, Object.fromEntries(tables.map(table => [table, table === "hr_attendance_import_batch" ? 1 : 0])));
  assert.deepEqual(out.phaseArtifact.targetTableCounts, out.candidates.targetTableCounts);
  assert.equal(out.candidates.records.length, 1);
});

test("deterministic output survives record and child ordering with immutable, detached inputs", () => {
  const input = fixture(); input.stagedRecords.push(oldPolicy(), oldPolicy(502)); const before = structuredClone(input), expected = assemble(freeze(input));
  const reordered = structuredClone(before); reordered.stagedRecords.reverse(); reordered.t0Candidates.records.reverse();
  for (const row of reordered.stagedRecords) (row.items ?? row.days).reverse();
  assert.deepEqual(assemble(reordered), expected); assert.deepEqual(input, before);
  expected.candidates.triple.codeSha = "mutated"; expected.phaseArtifact.triple.codeSha = "mutated";
  expected.candidates.targetScope.tenantId = "mutated";
  rows(expected, "hr_employee_insurance_period")[0].targetFields.source_snapshot.legacyItems.oldage.legacyFlag = "mutated";
  expected.policyRecoveries[0].lineage[0].targetProjection.sourceRowSha256 = "mutated";
  assert.deepEqual(input, before);
  const detached = assemble(before); before.stagedRecords[2].items[0].legacyFlag = "changed source";
  assert.equal(rows(detached, "hr_employee_insurance_period")[0].targetFields.source_snapshot.legacyItems.oldage.legacyFlag, null);
});

test("structural source drift, duplicate identities and partial or mixed recovery layouts reject with sanitized codes", () => {
  for (const mutate of [r => { r.sourceKey = "wrong"; }, r => { r.sourceIdentitySha256 = hash("wrong"); }, r => { r.sourceRowSha256 = "invalid"; },
    r => { r.source.unknown = "sensitive"; }, r => { r.items[0].unknown = "sensitive"; }, r => { r.items.push({ ...r.items[0] }); }]) {
    const input = fixture(); mutate(input.stagedRecords[2]); rejects(input, "T3_CANDIDATE_SOURCE_INVALID");
  }
  const duplicate = fixture(); duplicate.stagedRecords.push(duplicate.stagedRecords[0]); rejects(duplicate, "T3_CANDIDATE_SOURCE_DUPLICATE");
  for (const mutate of [r => r.items.pop(), r => { r.items[0].kind = "unknown"; }, r => { r.items[0] = policy().items[0]; }]) {
    const input = fixture(); input.stagedRecords[1] = oldPolicy(); mutate(input.stagedRecords[1]); rejects(input, "T3_POLICY_RECOVERY_LAYOUT_INVALID");
  }
  const drift = fixture(); drift.stagedRecords[1] = oldPolicy(); drift.stagedRecords[1].source.name = "changed sensitive source";
  rejects(drift, "T3_POLICY_RECOVERY_RAW_HASH_MISMATCH");
});

test("stale triple, scope, inventory, target and T0 bindings fail closed; arbitrary phase and attestation inputs are forbidden", () => {
  for (const key of ["codeSha", "sourceSnapshotHash", "mappingContractHash"]) {
    const input = fixture(); input.targetInventory.triple[key] = key === "codeSha" ? "b".repeat(40) : hash("stale"); rejects(input, "T3_CANDIDATE_INVENTORY_INVALID");
    const t0 = fixture(); t0.t0Candidates.triple[key] = key === "codeSha" ? "b".repeat(40) : hash("stale"); rejects(t0, "T3_CANDIDATE_T0_BINDING_INVALID");
  }
  const scope = fixture(); scope.targetScope.parkId = "wrong"; rejects(scope, "T3_CANDIDATE_SCOPE_INVALID");
  const scope2 = fixture(); scope2.targetInventory.targetScopeSha256 = hash("wrong"); rejects(scope2, "T3_CANDIDATE_INVENTORY_INVALID");
  const t0 = fixture(); t0.t0Candidates.targetIdentitySha256 = hash("wrong"); rejects(t0, "T3_CANDIDATE_T0_BINDING_INVALID");
  const binding = fixture(); binding.t0Candidates.targetInventoryArtifactSha256 = hash("wrong"); rejects(binding, "T3_CANDIDATE_T0_BINDING_INVALID");
  for (const key of ["phaseArtifactSha256", "resolutionArtifactSha256", "attestationSha256"]) {
    const input = fixture(); input.artifactHashes[key] = hash("asserted"); rejects(input, "T3_CANDIDATE_BINDINGS_INVALID");
  }
  const hashInput = fixture(); hashInput.attendanceFileSha256 = "invalid"; rejects(hashInput, "T3_CANDIDATE_BINDINGS_INVALID");
  const phase = fixture(); phase.phaseArtifact = {}; rejects(phase, "T3_CANDIDATE_INPUT_INVALID");
  const count = fixture(); count.targetInventory.targetTableCounts.hr_contract++; rejects(count, "T3_CANDIDATE_INVENTORY_INVALID");
  const missingTable = fixture(); delete missingTable.targetInventory.targetTableCounts.hr_contract; rejects(missingTable, "T3_CANDIDATE_INVENTORY_INVALID");
  const legacyInventory = fixture(); legacyInventory.targetInventory.kind = "yuzhou_hr_production_t0_target_inventory_readonly"; rejects(legacyInventory, "T3_CANDIDATE_INVENTORY_INVALID");
});

test("source period duplicates quarantine both parents before all their children; numeric calendar aliases also propagate", () => {
  const input = fixture(); input.stagedRecords.push(insurance(302)); const out = assemble(input);
  assert.ok(rows(out, "hr_employee_insurance_period").every(row => row.reasonCode === "T3_SOURCE_BUSINESS_COLLISION" && row.expectedTargetId === null));
  assert.equal(rows(out, "hr_employee_insurance_item").length, 12);
  assert.ok(rows(out, "hr_employee_insurance_item").every(row => row.reasonCode === "T3_PARENT_REQUIRES_REVIEW"));
  const calendars = fixture(); calendars.stagedRecords.push(calendar("0101")); const repeated = assemble(calendars);
  assert.ok(rows(repeated, "hr_attendance_calendar_source").every(row => row.reasonCode === "T3_SOURCE_BUSINESS_COLLISION"));
  assert.ok(rows(repeated, "hr_attendance_day").every(row => row.reasonCode === "T3_PARENT_REQUIRES_REVIEW"));
});

test("missing or quarantined employees block every dependent insurance item without guessing by name or policy", () => {
  const input = fixture(); input.stagedRecords[2] = insurance(301, "UNKNOWN"); const out = assemble(input);
  assert.equal(rows(out, "hr_employee_insurance_period")[0].reasonCode, "T3_EMPLOYEE_MISSING");
  assert.equal(rows(out, "hr_employee_insurance_period")[0].dependencyRefs[0].sourceIdentitySha256, hash("dbo.person\0UNKNOWN"));
  assert.ok(rows(out, "hr_employee_insurance_item").every(row => row.reasonCode === "T3_PARENT_REQUIRES_REVIEW"));
  assert.ok(rows(out, "hr_insurance_policy_item").every(row => row.candidateDisposition === "insert"));
  const blocked = fixture(); blocked.t0Candidates.records[1].candidateDisposition = "quarantine";
  blocked.t0Candidates.records[1].reasonCode = "EMPLOYEE_JOB_STATE_UNRESOLVED"; blocked.t0Candidates.status = "REVIEW_HOLD";
  blocked.t0Candidates.countByDisposition = { insert: 1, skip_exact: 0, review_target_collision: 0, quarantine: 1 };
  assert.equal(rows(assemble(blocked), "hr_employee_insurance_period")[0].reasonCode, "T3_PARENT_REQUIRES_REVIEW");
  for (const value of [null, "", " "]) {
    const absent = fixture(); absent.stagedRecords[2].source.employeeCode = value;
    assert.ok(assemble(absent).candidates.records.filter(row => row.sourceTable === "dbo.person_insure").every(row => row.reasonCode === "T3_EMPLOYEE_REQUIRED"));
  }
  const forged = fixture(); forged.t0Candidates.records[1].targetFields.employee_code = "UNKNOWN"; rejects(forged, "T3_CANDIDATE_T0_TARGET_INVALID");
  const id = fixture(); id.t0Candidates.records[1].expectedTargetId = "00000000-0000-5000-8000-000000000001"; rejects(id, "T3_CANDIDATE_T0_TARGET_INVALID");
  const refs = fixture(); refs.t0Candidates.records[1].dependencyRefs = []; rejects(refs, "T3_CANDIDATE_T0_DEPENDENCY_INVALID");
});

test("invalid source semantics conserve parents and children; child-only errors retain valid siblings", () => {
  const input = fixture(); input.stagedRecords[0].source.month = 13; input.stagedRecords[1].source.name = "x".repeat(201);
  input.stagedRecords[2].source.year = 1800; const out = assemble(input);
  assert.equal(out.candidates.records.length, 21); assert.deepEqual(out.candidates.targetTableCounts, assemble(fixture()).candidates.targetTableCounts);
  assert.ok(rows(out, "hr_attendance_day").every(row => row.reasonCode === "T3_CALENDAR_PERIOD_INVALID"));
  assert.ok(rows(out, "hr_insurance_policy_item").every(row => row.reasonCode === "T3_TEXT_LENGTH_INVALID"));
  assert.ok(rows(out, "hr_employee_insurance_item").every(row => row.reasonCode === "T3_CALENDAR_PERIOD_INVALID"));
  assert.deepEqual(out.phaseArtifact.records, out.candidates.records.map(provenance));
  const child = fixture(); child.stagedRecords[1].items[0].baseRate = "0.1234567"; child.stagedRecords[2].items[0].legacyBaseNegative = true;
  const childOut = assemble(child); assert.equal(childOut.candidates.countByDisposition.quarantine, 2);
  assert.equal(rows(childOut, "hr_insurance_policy_item").find(row => row.reasonCode)?.reasonCode, "T3_DECIMAL_PRECISION_LOSS");
  assert.equal(rows(childOut, "hr_employee_insurance_item").find(row => row.reasonCode)?.reasonCode, "T3_LEGACY_BASE_CONTRADICTION");
  const unknown = fixture(); unknown.stagedRecords[0].days[0].legacySymbol = "unknown-synthetic";
  const unknownOut = assemble(unknown); assert.equal(unknownOut.candidates.countByDisposition.quarantine, 1);
  assert.equal(rows(unknownOut, "hr_attendance_day").find(row => row.targetFields.legacy_symbol === "unknown-synthetic").targetFields.symbol_status, "needs_review");
  assert.equal(unknownOut.candidates.status, "REVIEW_HOLD");
});

test("all eight exact target canonical matches use inventory versions; a real field mismatch never overwrites", () => {
  const input = fixture(), first = assemble(input);
  for (const row of first.candidates.records) inventoryEntry(input, first, row);
  const exact = assemble(input); assert.equal(exact.candidates.countByDisposition.skip_exact, 21);
  assert.ok(exact.candidates.records.every(row => row.expectedTargetVersion === 3 && row.candidateDisposition === "skip_exact"));
  assert.deepEqual(exact.phaseArtifact, first.phaseArtifact);
  const policyRow = rows(first, "hr_insurance_policy")[0], entry = input.targetInventory.records.find(row => row.targetTable === policyRow.targetTable);
  entry.targetCanonicalSha256 = targetHash(policyRow.targetTable, input.targetScope, { ...policyRow.targetFields, policy_name: "Different target name" });
  const collision = assemble(input); assert.equal(rows(collision, "hr_insurance_policy")[0].candidateDisposition, "review_target_collision");
  assert.equal(rows(collision, "hr_insurance_policy")[0].reasonCode, "TARGET_CANONICAL_MISMATCH");
  assert.ok(rows(collision, "hr_insurance_policy_item").every(row => row.reasonCode === "T3_PARENT_REQUIRES_REVIEW"));
});

test("target parent conflicts block all descendants and exact parents reuse actual target IDs for child hashes", () => {
  for (const [table, childTable] of [["hr_attendance_import_batch", "hr_attendance_day"], ["hr_employee_insurance_period", "hr_employee_insurance_item"]]) {
    const input = fixture(), first = assemble(input), parent = rows(first, table)[0];
    inventoryEntry(input, first, parent, { targetCanonicalSha256: targetHash(table, input.targetScope, { ...parent.targetFields, remark: "existing mismatch" }, derivedFor(input, first, parent)) });
    const out = assemble(input); assert.equal(rows(out, table)[0].candidateDisposition, "review_target_collision");
    assert.ok(rows(out, childTable).every(row => row.reasonCode === "T3_PARENT_REQUIRES_REVIEW"));
  }
  const input = fixture(), first = assemble(input), parent = rows(first, "hr_insurance_policy")[0], actualId = "00000000-0000-5000-8000-000000000007";
  inventoryEntry(input, first, parent, { targetId: actualId }); const out = assemble(input);
  assert.equal(rows(out, parent.targetTable)[0].candidateDisposition, "skip_exact");
  assert.equal(rows(out, parent.targetTable)[0].expectedTargetId, actualId);
  for (const child of rows(out, "hr_insurance_policy_item")) assert.equal(child.businessIdentitySha256, businessHash(child.targetTable, input.targetScope, child.targetFields, { policy_id: actualId }));
});

test("validated existing T0 employee supplies its actual ID and rejects forged canonical equality", () => {
  const input = fixture(), first = assemble(input), employee = input.t0Candidates.records[1];
  const entry = inventoryEntry(input, first, employee, { targetId: "00000000-0000-5000-8000-000000000008", targetVersion: 7 });
  employee.candidateDisposition = "skip_exact"; employee.expectedTargetId = entry.targetId; employee.expectedTargetVersion = entry.targetVersion;
  employee.expectedTargetCanonicalSha256 = entry.targetCanonicalSha256; input.t0Candidates.countByDisposition = { insert: 1, skip_exact: 1, review_target_collision: 0, quarantine: 0 };
  const out = assemble(input), period = rows(out, "hr_employee_insurance_period")[0];
  assert.equal(period.businessIdentitySha256, businessHash(period.targetTable, input.targetScope, period.targetFields, { employee_id: entry.targetId }));
  employee.expectedTargetCanonicalSha256 = hash("forged"); rejects(input, "T3_CANDIDATE_T0_TARGET_INVALID");
});

test("target ID owned by another business blocks the parent and descendants; duplicate target inventory rejects", () => {
  const input = fixture(), first = assemble(input), parent = rows(first, "hr_insurance_policy")[0];
  inventoryEntry(input, first, parent, { businessIdentitySha256: hash("different business") }); const out = assemble(input);
  assert.equal(rows(out, parent.targetTable)[0].reasonCode, "T3_TARGET_ID_COLLISION");
  assert.ok(rows(out, "hr_insurance_policy_item").every(row => row.reasonCode === "T3_PARENT_REQUIRES_REVIEW"));
  input.targetInventory.records.push({ ...input.targetInventory.records[0] }); input.targetInventory.targetTableCounts.hr_insurance_policy++;
  rejects(input, "T3_CANDIDATE_INVENTORY_INVALID");
});
