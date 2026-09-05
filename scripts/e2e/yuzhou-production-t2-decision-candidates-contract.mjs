import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { assembleProductionT2DecisionCandidates as assemble, ProductionT2CandidatesError } from "../hr-cutover/production-t2-decision-candidates.mjs";
import { projectProductionT2Fields } from "../hr-cutover/production-t2-field-projection.mjs";
import { T2_CONTRACT_SEMANTIC_FIELDS } from "../hr-cutover/t2-contract-semantics.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, computeProductionImportBusinessIdentityHash as businessHash, computeProductionImportTargetCanonicalHash as targetHash, deriveProductionImportTargetId as deriveId } from "../hr-cutover/production-import-target-model.mjs";
import { computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const tables = ["hr_contract_type", "hr_contract", "hr_contract_change", "hr_contract_legacy_evidence"];
const record = (sourceTable, source) => {
  const sourceKey = sourceTable === "dbo.compacttypecode" ? String(source.typeCode).trim() : sourceTable === "dbo.compact" ? source.contractNo.trim()
    : [source.contractNo, source.employeeCode, source.startDate, source.endDate, source.signedAt].map(value => String(value ?? "").trim()).join("|");
  return { sourceTable, sourceKey, sourceIdentitySha256: hash(`${sourceTable}\0${sourceKey}`), sourceRowSha256: hash(JSON.stringify(source, Object.keys(source).sort())), source };
};
function contract(overrides = {}) {
  return { contractNo: "SYN-C1", employeeCode: "SYN-E1", typeName: "Synthetic type", startDate: "2024-01-01", endDate: "2025-12-31", probationEndDate: null,
    signedDate: null, contractMonths: "ambiguous", totalContractMonths: null, continueyears: null, continuetimes: null,
    derivedContractTermMonths: 24, legacyRenewalCount: null, contractTermDecision: "DERIVED_FROM_DATE_BOUNDARY", signatureDateDecision: "ABSENT", renewalCountDecision: "ABSENT_DEFAULT_ZERO",
    probationMonths: null, probationSalary: null, baseSalary: "12.30", legacyState: "SYN-A", confidentialityFlag: 0, nonCompeteFlag: 0, trainingServiceFlag: 0,
    legacyTextPresent: 1, legacyFilePresent: 1, legacyTextSha256: hash("synthetic-text"), legacyTextBytes: 12, legacyFileLocatorSha256: hash("synthetic-reference"), ...overrides };
}
function change(overrides = {}) {
  return { contractNo: "SYN-C1", employeeCode: "SYN-E1", contractMonths: "ambiguous", startDate: "2026-01-01 09:00:00", endDate: "2026-12-31 18:00:00", signedAt: "2025-12-20 11:22:33", sequenceNo: 1, ...overrides };
}
function t0row(table, sourceTable, code, fields, scope, parents = []) {
  const identity = hash(`${sourceTable}\0${code}`), derived = Object.fromEntries(parents.map(([role, parent]) => [model.targetTables[table].foreignKeys.find(fk => fk.dependencyRole === role).column, parent.expectedTargetId]));
  return { phase: "T0", targetTable: table, sourceSystem: "yuzhou-v10", sourceTable, sourcePkCanonical: `sha256:${identity}`, sourceIdentitySha256: identity,
    sourceRowSha256: hash(`synthetic-${code}`), candidateDisposition: "insert", reasonCode: null, targetFields: fields,
    dependencyRefs: parents.map(([role, parent]) => ({ role, phase: "T0", sourceIdentitySha256: parent.sourceIdentitySha256, expectedTargetTable: parent.targetTable })),
    businessIdentitySha256: businessHash(table, scope, fields, derived), expectedTargetId: deriveId({ targetScope: scope, targetTable: table, sourceIdentitySha256: identity }), expectedTargetVersion: null, expectedTargetCanonicalSha256: null };
}
function fixture() {
  const triple = { codeSha: "a".repeat(40), sourceSnapshotHash: hash("source"), mappingContractHash: hash("mapping") };
  const scope = { tenantId: "synthetic-tenant", parkId: "synthetic-park" }; scope.scopeSha256 = computeProductionImportTargetScopeHash(scope);
  const org = t0row("sys_org", "dbo.departmentcode", "SYN-ORG", { org_code: "SYN-ORG", org_name: "Synthetic org", org_type: "department", sort_order: 0, status: "enabled", remark: null }, scope);
  const employee = t0row("hr_employee", "dbo.person", "SYN-E1", { employee_code: "SYN-E1", full_name: "Synthetic employee", employment_type: "full_time", employment_status: "active", hire_date: null, probation_end_date: null, departure_date: null, work_location: null, work_mobile: null, work_email: null, remark: null }, scope, [["primary_org", org]]);
  const inventory = { formatVersion: 1, kind: "yuzhou_hr_production_target_inventory_readonly", status: "PASS", productionImport: "HOLD", executionReachable: false,
    targetIdentitySha256: hash("target"), targetScopeSha256: scope.scopeSha256, sourceManifestSha256: hash("manifest"), triple,
    targetTableCounts: Object.fromEntries(Object.keys(model.targetTables).map(table => [table, 0])), records: [] };
  const artifactHashes = { phaseArtifactSha256: hash("phase bytes"), targetInventoryArtifactSha256: hash("inventory bytes"), t0CandidatesArtifactSha256: hash("t0 bytes"), resolutionArtifactSha256: hash("resolution bytes") };
  const t0Candidates = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_t0_decision_candidates", triple, phaseArtifactSha256: hash("t0phase"), targetInventoryArtifactSha256: artifactHashes.targetInventoryArtifactSha256,
    targetIdentitySha256: inventory.targetIdentitySha256, targetScope: scope, jobStateDecisionArtifactSha256: hash("jobstate"), status: "READY_FOR_FREEZE", countByDisposition: { insert: 2, skip_exact: 0, review_target_collision: 0, quarantine: 0 }, records: [org, employee], productionImport: "HOLD" };
  const input = { triple, targetScope: scope, targetInventory: inventory, t0Candidates, artifactHashes,
    stagedRecords: [record("dbo.compacttypecode", { typeCode: "1", typeName: "Synthetic type" }), record("dbo.compact", contract()), record("dbo.compact_c", change())], resolutions: [], phaseArtifact: null };
  refresh(input); return input;
}
// Independent phase provenance calculation also permits intentionally invalid semantic rows.
function refresh(input, resolve = row => row.sourceTable === "dbo.compacttypecode" ? { typeCode: "FIXED" } : row.sourceTable === "dbo.compact" ? { status: "active" } : { changeType: "renewal" }) {
  input.resolutions = input.stagedRecords.map(row => ({ sourceIdentitySha256: row.sourceIdentitySha256, resolved: resolve(row) }));
  const records = input.stagedRecords.flatMap(row => {
    const targets = [[{ "dbo.compacttypecode": tables[0], "dbo.compact": tables[1], "dbo.compact_c": tables[2] }[row.sourceTable], row.sourceIdentitySha256]];
    if (row.sourceTable === "dbo.compact") for (const [flag, kind] of [["legacyTextPresent", "controlled_text"], ["legacyFilePresent", "file_manifest"]]) {
      if (row.source[flag] === 1) targets.push([tables[3], hash(`yuzhou-hr-production-source-projection-v1\0${row.sourceIdentitySha256}\0${tables[3]}\0${kind}`)]);
    }
    return targets.map(([targetTable, identity]) => ({ phase: "T2", targetTable, sourceSystem: "yuzhou-v10", sourceTable: row.sourceTable, sourceIdentitySha256: identity, sourcePkCanonical: `sha256:${identity}`, sourceRowSha256: row.sourceRowSha256 }));
  });
  input.phaseArtifact = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_phase_staging", triple: structuredClone(input.triple), phase: "T2", targetTableCounts: Object.fromEntries(tables.map(table => [table, records.filter(row => row.targetTable === table).length])), records };
}
const rows = (result, table) => result.records.filter(row => row.targetTable === table);
function inventoryEntry(input, row, canonicalSha = null) {
  const derived = Object.fromEntries(row.dependencyRefs.map(ref => {
    const parent = [...assemble(input).records, ...input.t0Candidates.records].find(item => item.sourceIdentitySha256 === ref.sourceIdentitySha256);
    const column = model.targetTables[row.targetTable].foreignKeys.find(fk => fk.dependencyRole === ref.role).column;
    return [column, parent.expectedTargetId];
  }));
  const entry = { targetTable: row.targetTable, businessIdentitySha256: row.businessIdentitySha256, targetId: row.expectedTargetId, targetCanonicalSha256: canonicalSha ?? targetHash(row.targetTable, input.targetScope, row.targetFields, derived), targetVersion: 3 };
  input.targetInventory.records.push(entry); input.targetInventory.targetTableCounts[row.targetTable]++; return entry;
}
const rejects = (input, code) => assert.throws(() => assemble(input), error => error instanceof ProductionT2CandidatesError && error.code === code && error.message === code);

test("raw-shaped legacy contract unblocks renewal and evidence without rewriting provenance", () => {
  const input = fixture();
  const source = Object.fromEntries(Object.entries(input.stagedRecords[1].source).filter(([key]) => !T2_CONTRACT_SEMANTIC_FIELDS.includes(key)));
  Object.assign(source, { confidentialityFlag: "否", nonCompeteFlag: "否", trainingServiceFlag: "否" });
  input.stagedRecords[1] = record("dbo.compact", source); refresh(input);
  const before = structuredClone(input), out = assemble(input);
  assert.deepEqual(input, before); assert.equal(out.countByDisposition.insert, 5); assert.equal(out.countByDisposition.quarantine, 0);
  const parent = rows(out, tables[1])[0];
  assert.equal(parent.sourceRowSha256, input.stagedRecords[1].sourceRowSha256);
  assert.equal(parent.targetFields.contract_term_months, 24);
  for (const child of [...rows(out, tables[2]), ...rows(out, tables[3])]) {
    assert.equal(child.candidateDisposition, "insert"); assert.equal(child.dependencyRefs[0].sourceIdentitySha256, parent.sourceIdentitySha256);
  }
});
test("partial and inconsistent semantic claims quarantine parent and preserve blocked children", () => {
  for (const mutate of [source => { delete source.renewalCountDecision; }, source => { source.derivedContractTermMonths = 25; }]) {
    const input = fixture(), source = contract(); mutate(source);
    input.stagedRecords[1] = record("dbo.compact", source); refresh(input);
    const out = assemble(input);
    assert.equal(out.records.length, 5); assert.equal(rows(out, tables[1])[0].reasonCode, "T2_SEMANTIC_DECISION_INVALID");
    assert.equal(rows(out, tables[2])[0].candidateDisposition, "quarantine");
    assert.equal(rows(out, tables[3]).every(row => row.candidateDisposition === "quarantine"), true);
  }
});

test("assembles all four tables with explicit FK dependencies, stable IDs and exact fields", () => {
  const input = fixture(), before = structuredClone(input), out = assemble(input);
  assert.deepEqual(input, before); assert.equal(out.status, "READY_FOR_REVIEW"); assert.equal(out.productionImport, "HOLD");
  assert.deepEqual(out.targetTableCounts, { hr_contract_type: 1, hr_contract: 1, hr_contract_change: 1, hr_contract_legacy_evidence: 2 });
  assert.equal(out.countByDisposition.insert, 5);
  const c = rows(out, "hr_contract")[0], h = rows(out, "hr_contract_change")[0];
  assert.deepEqual(c.dependencyRefs.map(ref => ref.role), ["employee", "contract_type"]);
  assert.equal(c.dependencyRefs[0].sourceIdentitySha256, hash("dbo.person\0SYN-E1"));
  assert.equal(h.dependencyRefs[0].sourceIdentitySha256, c.sourceIdentitySha256);
  assert.deepEqual(c.targetFields, projectProductionT2Fields(input.stagedRecords[1], { status: "active" })[0].targetFields);
  assert.equal(c.targetFields.base_salary, "12.30"); assert.equal(h.targetFields.signed_at, "2025-12-20T11:22:33.000");
  for (const e of rows(out, tables[3])) { assert.equal(e.dependencyRefs[0].sourceIdentitySha256, c.sourceIdentitySha256); assert.equal(e.targetFields.protected_file_id, null); }
  out.records[0].targetFields.type_name = "mutated output"; assert.deepEqual(input, before);
});
test("input order does not change artifact content", () => {
  const input = fixture(), expected = assemble(input);
  input.stagedRecords.reverse(); input.resolutions.reverse(); input.phaseArtifact.records.reverse(); input.t0Candidates.records.reverse();
  assert.deepEqual(assemble(input), expected);
});
test("empty T2 retains four zero counts without inventing records", () => {
  const input = fixture(); input.stagedRecords = []; refresh(input);
  const out = assemble(input); assert.equal(out.records.length, 0); assert.deepEqual(out.targetTableCounts, Object.fromEntries(tables.map(table => [table, 0])));
});
test("source/hash/unmapped field drift and phase missing/extra/count drift reject whole input", () => {
  for (const mutate of [input => { input.stagedRecords[1].source.baseSalary = "99.00"; }, input => { input.stagedRecords[1] = record("dbo.compact", contract({ futureField: "unknown" })); refresh(input); }]) {
    const input = fixture(); mutate(input); rejects(input, "T2_CANDIDATE_SOURCE_INVALID");
  }
  for (const mutate of [input => input.phaseArtifact.records.pop(), input => input.phaseArtifact.records.push(input.phaseArtifact.records[0]), input => input.phaseArtifact.targetTableCounts.hr_contract++]) {
    const input = fixture(); mutate(input); rejects(input, "T2_CANDIDATE_PHASE_COVERAGE_INVALID");
  }
  const duplicate = fixture(); duplicate.stagedRecords.push(duplicate.stagedRecords[0]); rejects(duplicate, "T2_CANDIDATE_SOURCE_DUPLICATE");
});
test("source/code/mapping/scope/inventory bindings cannot drift", () => {
  const phase = fixture(); phase.phaseArtifact.triple.codeSha = "b".repeat(40); rejects(phase, "T2_CANDIDATE_PHASE_INVALID");
  const inventory = fixture(); inventory.targetInventory = structuredClone(inventory.targetInventory); inventory.targetInventory.triple.mappingContractHash = hash("other"); rejects(inventory, "T2_CANDIDATE_INVENTORY_INVALID");
  const scope = fixture(); scope.targetScope.parkId = "other"; rejects(scope, "T2_CANDIDATE_SCOPE_INVALID");
  const t0 = fixture(); t0.t0Candidates.targetInventoryArtifactSha256 = hash("old"); rejects(t0, "T2_CANDIDATE_T0_BINDING_INVALID");
  const count = fixture(); count.targetInventory.targetTableCounts.hr_contract++; rejects(count, "T2_CANDIDATE_INVENTORY_INVALID");
});
test("missing employee and blocked employee prevent contract and child inserts", () => {
  const missing = fixture(); missing.stagedRecords[1] = record("dbo.compact", contract({ employeeCode: "missing" })); refresh(missing);
  assert.equal(rows(assemble(missing), tables[1])[0].reasonCode, "T2_EMPLOYEE_MISSING");
  const input = fixture(), e = input.t0Candidates.records[1]; e.candidateDisposition = "quarantine"; e.reasonCode = "EMPLOYEE_JOB_STATE_UNRESOLVED";
  input.t0Candidates.countByDisposition = { insert: 1, skip_exact: 0, review_target_collision: 0, quarantine: 1 }; input.t0Candidates.status = "REVIEW_HOLD";
  const out = assemble(input); assert.equal(rows(out, tables[1])[0].reasonCode, "T2_PARENT_REQUIRES_REVIEW");
  assert.equal(out.countByDisposition.insert, 1); assert.equal(out.countByDisposition.quarantine, 4);
});
test("forged T0 target IDs and source employee identities do not create dependencies", () => {
  const id = fixture(); id.t0Candidates.records[1].expectedTargetId = "00000000-0000-5000-8000-000000000001"; rejects(id, "T2_CANDIDATE_T0_TARGET_INVALID");
  const code = fixture(); code.t0Candidates.records[1].targetFields.employee_code = "another"; rejects(code, "T2_CANDIDATE_T0_TARGET_INVALID");
  const deps = fixture(); deps.t0Candidates.records[1].dependencyRefs = []; rejects(deps, "T2_CANDIDATE_T0_DEPENDENCY_INVALID");
});
test("type ambiguity and missing type are explicit, never first-match guesses", () => {
  const input = fixture(); input.stagedRecords.push(record("dbo.compacttypecode", { typeCode: "2", typeName: "Synthetic type" }));
  refresh(input, row => row.sourceTable === "dbo.compacttypecode" ? { typeCode: `TYPE${row.source.typeCode}` } : row.sourceTable === "dbo.compact" ? { status: "active" } : { changeType: "renewal" });
  assert.equal(rows(assemble(input), tables[1])[0].reasonCode, "T2_CONTRACT_TYPE_AMBIGUOUS");
  input.stagedRecords = input.stagedRecords.filter(row => row.sourceTable !== "dbo.compacttypecode"); refresh(input);
  assert.equal(rows(assemble(input), tables[1])[0].reasonCode, "T2_CONTRACT_TYPE_MISSING");
});
test("two type sources mapped to one business key both block before contracts", () => {
  const input = fixture(); input.stagedRecords.push(record("dbo.compacttypecode", { typeCode: "2", typeName: "Other type" })); refresh(input);
  const out = assemble(input);
  assert.ok(rows(out, tables[0]).every(row => row.reasonCode === "T2_SOURCE_BUSINESS_COLLISION" && row.expectedTargetId === null));
  assert.equal(rows(out, tables[1])[0].reasonCode, "T2_PARENT_REQUIRES_REVIEW");
});
test("change belongs to exact contract owner and sequence uniqueness is checked", () => {
  const input = fixture(); input.stagedRecords[2] = record("dbo.compact_c", change({ employeeCode: "OTHER" })); refresh(input);
  assert.equal(rows(assemble(input), tables[2])[0].reasonCode, "T2_CONTRACT_OWNER_MISMATCH");
  input.stagedRecords[2] = record("dbo.compact_c", change()); input.stagedRecords.push(record("dbo.compact_c", change({ signedAt: "2025-12-21 11:22:33" }))); refresh(input);
  assert.ok(rows(assemble(input), tables[2]).every(row => row.reasonCode === "T2_SOURCE_BUSINESS_COLLISION"));
});
test("semantic errors preserve entire contract/evidence coverage and block dependent changes", () => {
  const input = fixture(); input.stagedRecords[1] = record("dbo.compact", contract({ confidentialityFlag: null })); refresh(input);
  const out = assemble(input); assert.equal(out.records.length, 5); assert.equal(out.countByDisposition.quarantine, 4);
  assert.equal(rows(out, tables[1])[0].reasonCode, "T2_LEGACY_FLAG_UNRESOLVED");
  assert.ok(rows(out, tables[3]).every(row => row.reasonCode === "T2_LEGACY_FLAG_UNRESOLVED" && row.targetFields === null));
  assert.equal(rows(out, tables[2])[0].reasonCode, "T2_PARENT_REQUIRES_REVIEW");
});
test("resolution coverage is exact and unresolved semantics remain review only", () => {
  const input = fixture(); input.resolutions.pop(); rejects(input, "T2_CANDIDATE_RESOLUTION_INVALID");
  const unresolved = fixture(); unresolved.resolutions[0].resolved = {};
  assert.equal(rows(assemble(unresolved), tables[0])[0].reasonCode, "T2_DICTIONARY_DECISION_INVALID");
});
test("target canonical match yields skip_exact, conflict propagates without overwrite", () => {
  const input = fixture(), type = rows(assemble(input), tables[0])[0]; inventoryEntry(input, type);
  assert.equal(rows(assemble(input), tables[0])[0].candidateDisposition, "skip_exact");
  input.targetInventory.records[0].targetCanonicalSha256 = hash("different");
  const out = assemble(input); assert.equal(rows(out, tables[0])[0].candidateDisposition, "review_target_collision");
  assert.equal(rows(out, tables[1])[0].reasonCode, "T2_PARENT_REQUIRES_REVIEW");
});
test("existing exact contract preserves dependent foreign key target identity", () => {
  const input = fixture(), c = rows(assemble(input), tables[1])[0]; inventoryEntry(input, c);
  const actualId = "00000000-0000-5000-8000-000000000007";
  input.targetInventory.records[0].targetId = actualId;
  const out = assemble(input); assert.equal(rows(out, tables[1])[0].candidateDisposition, "skip_exact");
  assert.equal(rows(out, tables[1])[0].expectedTargetId, actualId);
  const changed = rows(out, tables[2])[0]; assert.equal(changed.candidateDisposition, "insert");
  assert.equal(changed.businessIdentitySha256, businessHash(tables[2], input.targetScope, changed.targetFields, { contract_id: actualId }));
});
test("T0 employee exact-skip requires its canonical inventory row and uses the real ID", () => {
  const input = fixture(), employee = input.t0Candidates.records[1], org = input.t0Candidates.records[0];
  employee.candidateDisposition = "skip_exact"; employee.expectedTargetId = "00000000-0000-5000-8000-000000000008";
  employee.expectedTargetVersion = 7; employee.expectedTargetCanonicalSha256 = targetHash("hr_employee", input.targetScope, employee.targetFields, { primary_org_id: org.expectedTargetId });
  input.targetInventory.records.push({ targetTable: "hr_employee", businessIdentitySha256: employee.businessIdentitySha256, targetId: employee.expectedTargetId, targetVersion: 7, targetCanonicalSha256: employee.expectedTargetCanonicalSha256 });
  input.targetInventory.targetTableCounts.hr_employee = 1; input.t0Candidates.countByDisposition = { insert: 1, skip_exact: 1, review_target_collision: 0, quarantine: 0 };
  assert.equal(rows(assemble(input), tables[1])[0].candidateDisposition, "insert");
  employee.expectedTargetCanonicalSha256 = hash("wrong"); rejects(input, "T2_CANDIDATE_T0_TARGET_INVALID");
});
test("target ID already owned by another business record blocks without using it", () => {
  const input = fixture(), type = rows(assemble(input), tables[0])[0]; const existing = inventoryEntry(input, type);
  existing.businessIdentitySha256 = hash("unrelated business");
  const out = assemble(input); assert.equal(rows(out, tables[0])[0].reasonCode, "T2_TARGET_ID_COLLISION");
  assert.equal(out.countByDisposition.insert, 0);
});
