import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { verifyProductionT1SourceRevalidation as verify } from "../hr-cutover/production-t1-source-revalidation.mjs";
import { materializeProductionT1DecisionCandidates as materialize } from "../hr-cutover/materialize-production-t1-decision-candidates.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, stableProductionImportCanonicalJson as canonical, computeProductionImportBusinessIdentityHash as businessHash, deriveProductionImportTargetId as deriveId } from "../hr-cutover/production-import-target-model.mjs";
import { computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { materializeProductionTargetInventory } from "../hr-cutover/materialize-production-target-inventory.mjs";
import { normalizeProductionT1LocalTimestamp as timestamp } from "../hr-cutover/production-t1-local-timestamp.mjs";

const hash = b => createHash("sha256").update(b).digest("hex");
const ch = value => hash(canonical(value) + "\n");
const serialized = value => Buffer.from(JSON.stringify(value) + "\n");
const template = JSON.parse(readFileSync(new URL("../hr-cutover/contracts/yuzhou-t1-employment-event-type-decision-v1.json", import.meta.url)));
const triple = { codeSha: "a".repeat(40), sourceSnapshotHash: hash("synthetic source"), mappingContractHash: hash("current mapping") };
function inputs() {
  let id = 0;
  const typeDecision = { ...structuredClone(template), sourceSnapshotSha256: triple.sourceSnapshotHash };
  const events = typeDecision.decisions.flatMap(d => Array.from({ length: d.usageCount }, () => {
    id++;
    const source = { legacyId: id, legacyEventNo: `EV-${id}`, employeeCode: id === 6887 ? "SYN-MISSING" : "SYN-E", legacyEventType: d.sourceValue, sourceEffectiveAt: "2026-01-01 08:30:00", beforeOrgCode: null, afterOrgCode: "SYN-O", beforePositionCode: null, afterPositionCode: null, legacyEmployeeState: null, legacyState: id === 1 ? "0" : "1", departmentflag: null, jobflag: null, payflag: null, otherflag: null, reason: null };
    return { sourceTable: "dbo.readjust", sourceKey: String(id), sourceIdentitySha256: hash(`dbo.readjust\0${id}`), sourceRowSha256: hash(JSON.stringify(source, Object.keys(source).sort())), source };
  }));
  const types = typeDecision.decisions.map(({ sourceValue, usageCount }) => ({ sourceValue, usageCount }));
  const states = [{ sourceValue: "0", usageCount: 1 }, { sourceValue: "1", usageCount: 6886 }];
  const stageBytes = { employmentEvents: Buffer.from(events.map(r => JSON.stringify(r) + "\n").join("")), employmentEventTypes: serialized(types), employmentEventStates: serialized(states) };
  const filenames = { employmentEvents: "employment-events.jsonl", employmentEventTypes: "employment-event-types.json", employmentEventStates: "employment-event-states.json" };
  const domains = Object.fromEntries(Object.entries(stageBytes).map(([k, b]) => [k, { rows: k === "employmentEvents" ? events.length : k === "employmentEventTypes" ? types.length : states.length, file: filenames[k], fileSha256: hash(b) }]));
  const stageManifestBytes = serialized({ formatVersion: 1, domains });
  const all = { T0: ["departments", "employeeJobStates", "employees", "jobStateCodeMetadata", "jobStateCodes", "positions"], T1: Object.keys(domains), T2: ["dbo.compacttypecode", "dbo.compact", "dbo.compact_c", "dbo.compact.state"], T3: ["attendance", "insurance", "policies"] };
  const sourceManifest = { formatVersion: 1, artifactKind: "yuzhou_hr_production_source_manifest", sourceReadOnly: true, sourceSnapshotSha256: triple.sourceSnapshotHash, sourceRestoreReceiptSha256: hash("receipt"), sourceCatalogSha256: hash("catalog"), mappingContractSha256: triple.mappingContractHash, phases: Object.fromEntries(Object.entries(all).map(([phase, names]) => [phase, { stageManifestSha256: phase === "T1" ? hash(stageManifestBytes) : hash(phase), domains: Object.fromEntries(names.map(n => [n, phase === "T1" ? { rows: domains[n].rows, fileSha256: domains[n].fileSha256 } : { rows: 0, fileSha256: hash(n) }])) }])), productionImport: "HOLD" };
  const statePackage = { formatVersion: 1, kind: "yuzhou_core_non_t0_machine_dictionary_package", triple: { ...triple, codeSha: "b".repeat(40), mappingContractHash: hash("old mapping") }, trustedRootSha256: hash("old machine root"), machineActor: { id: "00000000-0000-5000-8000-000000000001", kind: "machine_policy_engine", verifiedAt: "2026-09-01T00:00:00Z" }, evidence: { t1Types: hash(stageBytes.employmentEventTypes), t1States: hash(stageBytes.employmentEventStates), t2Types: hash("t2types"), t2States: hash("t2states") }, dictionaries: ["employment_event_type", "contract_type", "contract_state"].map(dictionaryCode => ({ dictionaryCode })), productionImport: "HOLD" };
  const d = { dictionaryCode: "employment_event_state", sourceTable: "dbo.readjust", sourceSnapshotSha256: ch({ kind: "employment_event_state", source: statePackage.evidence.t1States }), items: states.map(s => {
    const source = { sourceCode: null, sourceName: null, sourceValue: s.sourceValue };
    return { id: "00000000-0000-5000-8000-000000000001", ...source, sourceIdentitySha256: hash(`dbo.readjust.state\0${s.sourceValue}`), sourceRowSha256: ch(source), decision: s.sourceValue === "1" ? "map" : "reject", targetDomain: s.sourceValue === "1" ? "migration_decision" : null, targetValue: s.sourceValue === "1" ? "accepted" : null, reasonCode: s.sourceValue === "1" ? "EFFECTIVE_SOURCE_STATE" : "SOURCE_NON_EFFECTIVE_STATE" };
  }) };
  statePackage.dictionaries.push(d);
  const attest = (binding = statePackage.triple) => { d.machineAttestationSha256 = ch({ triple: binding, trustedRootSha256: statePackage.trustedRootSha256, dictionaryCode: d.dictionaryCode, sourceSnapshotSha256: d.sourceSnapshotSha256, items: d.items.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "id"))) }); };
  attest();
  return { triple: { ...triple }, sourceManifest, stageManifestBytes, stageBytes, typeDecision, statePackage, events, filenames, attest };
}
function fixture(t) {
  const i = inputs(), root = realpathSync(mkdtempSync(join(tmpdir(), "hr-t1-revalidation-"))); chmodSync(root, 0o700); t.after(() => rmSync(root, { recursive: true, force: true }));
  const stagingDir = join(root, "stage"); mkdirSync(stagingDir, { mode: 0o700 });
  const write = (name, value) => { const p = join(root, name); writeFileSync(p, Buffer.isBuffer(value) ? value : serialized(value), { mode: 0o600 }); return p; };
  const sourceManifestPath = write("source.json", i.sourceManifest), triplePath = write("triple.json", i.triple);
  write("stage/manifest.json", i.stageManifestBytes); for (const [key, bytes] of Object.entries(i.stageBytes)) write(`stage/${i.filenames[key]}`, bytes);
  const targetScope = { tenantId: "SYN-T", parkId: "SYN-P" }; targetScope.scopeSha256 = computeProductionImportTargetScopeHash(targetScope);
  const inventory = { formatVersion: 1, kind: "yuzhou_hr_production_target_inventory_readonly", status: "PASS", productionImport: "HOLD", executionReachable: false, triple: i.triple, sourceManifestSha256: hash(canonical(i.sourceManifest)), targetIdentitySha256: hash("target"), targetScopeSha256: targetScope.scopeSha256, targetTableCounts: Object.fromEntries(Object.keys(model.targetTables).map(k => [k, 0])), records: [] };
  const inventoryPath = write("inventory.json", inventory);
  const make = (table, key, fields, parent = null) => {
    const sourceTable = table === "sys_org" ? "dbo.departmentcode" : "dbo.person", identity = hash(`${sourceTable}\0${key}`), targetFields = { ...Object.fromEntries(model.targetTables[table].nullableFields.map(k => [k, null])), ...fields }, derived = parent ? { primary_org_id: parent.expectedTargetId } : {};
    return { phase: "T0", targetTable: table, sourceSystem: "yuzhou-v10", sourceTable, sourcePkCanonical: `sha256:${identity}`, sourceIdentitySha256: identity, sourceRowSha256: hash(key), candidateDisposition: "insert", reasonCode: null, targetFields, dependencyRefs: parent ? [{ role: "primary_org", phase: "T0", sourceIdentitySha256: parent.sourceIdentitySha256, expectedTargetTable: "sys_org" }] : [], businessIdentitySha256: businessHash(table, targetScope, targetFields, derived), expectedTargetId: deriveId({ targetScope, targetTable: table, sourceIdentitySha256: identity }), expectedTargetVersion: null, expectedTargetCanonicalSha256: null };
  };
  const org = make("sys_org", "SYN-O", { org_code: "SYN-O", org_name: "Synthetic org", org_type: "department", sort_order: 0, status: "enabled" });
  const employee = make("hr_employee", "SYN-E", { employee_code: "SYN-E", full_name: "Synthetic employee", employment_type: "full_time", employment_status: "active" }, org);
  const t0 = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_t0_decision_candidates", triple: i.triple, phaseArtifactSha256: hash("t0phase"), targetInventoryArtifactSha256: hash(readFileSync(inventoryPath)), targetIdentitySha256: inventory.targetIdentitySha256, targetScope, jobStateDecisionArtifactSha256: hash("jobstate"), status: "READY_FOR_FREEZE", countByDisposition: { insert: 2, skip_exact: 0, review_target_collision: 0, quarantine: 0 }, records: [org, employee], productionImport: "HOLD" };
  const input = { stagingDir, triplePath, sourceManifestPath, targetInventoryPath: inventoryPath, t0CandidatesPath: write("t0.json", t0), typeDecisionPath: write("types.json", i.typeDecision), stateDecisionPath: write("states.json", i.statePackage), phaseArtifactPath: write("phase.json", { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_phase_staging", triple: i.triple, phase: "T1", records: i.events.map(({ sourceTable, sourceIdentitySha256, sourceRowSha256 }) => ({ phase: "T1", targetTable: "hr_employment_event", sourceSystem: "yuzhou-v10", sourceTable, sourcePkCanonical: `sha256:${sourceIdentitySha256}`, sourceIdentitySha256, sourceRowSha256 })) }), outputPath: join(root, "out.json") };
  return { i, input, root, inventory, t0, write, syncInventory() { write("inventory.json", inventory); t0.targetInventoryArtifactSha256 = hash(readFileSync(inventoryPath)); write("t0.json", t0); } };
}
const stableFailure = fn => assert.throws(fn, e => /^PRODUCTION_IMPORT_T1_/u.test(e.code ?? e.message));
function refreshEvents(i) {
  i.stageBytes.employmentEvents = Buffer.from(i.events.map(r => JSON.stringify(r) + "\n").join(""));
  const manifest = JSON.parse(i.stageManifestBytes);
  manifest.domains.employmentEvents.fileSha256 = hash(i.stageBytes.employmentEvents);
  i.sourceManifest.phases.T1.domains.employmentEvents.fileSha256 = manifest.domains.employmentEvents.fileSha256;
  i.stageManifestBytes = serialized(manifest);
  i.sourceManifest.phases.T1.stageManifestSha256 = hash(i.stageManifestBytes);
}

test("current source semantics independently validate historic state evidence and preserve all events", () => {
  const i = inputs(), original = JSON.stringify(i.statePackage), result = verify(i);
  assert.equal(result.sourceRecordCount, 6887); assert.equal(result.typeMappings.size, 4); assert.equal(result.stateMappings.size, 2); assert.equal(result.stateMappings.get("0").decision, "reject");
  assert.equal(JSON.stringify(i.statePackage), original); assert.deepEqual(result.originalTriple, i.statePackage.triple);
});
test("state policy and original attestation cannot be replaced with current labels or fresh hashes", () => {
  const a = inputs(); a.attest(a.triple); stableFailure(() => verify(a));
  const b = inputs(); b.statePackage.dictionaries.at(-1).items[1].targetValue = "ignored"; b.attest(); stableFailure(() => verify(b));
  const c = inputs(); c.statePackage.triple.sourceSnapshotHash = hash("wrong source"); c.attest(); stableFailure(() => verify(c));
});
test("swapped type targets, actual usage drift and changed file bytes fail", () => {
  const a = inputs(); [a.typeDecision.decisions[0].targetValue, a.typeDecision.decisions[1].targetValue] = [a.typeDecision.decisions[1].targetValue, a.typeDecision.decisions[0].targetValue]; stableFailure(() => verify(a));
  const b = inputs(); b.stageBytes.employmentEvents = Buffer.from("{}\n"); stableFailure(() => verify(b));
  const c = inputs(); c.sourceManifest.mappingContractSha256 = hash("wrong mapping"); stableFailure(() => verify(c));
});
test("full current inventory path preserves original dictionary SHA and quarantines only missing employee/non-effective state", t => {
  const f = fixture(t), before = readFileSync(f.input.stateDecisionPath), result = materialize(f.input, { head: () => triple.codeSha }), out = JSON.parse(readFileSync(f.input.outputPath));
  assert.equal(result.recordCount, 6887); assert.deepEqual(result.countByDisposition, { insert: 6885, skip_exact: 0, review_target_collision: 0, quarantine: 2 });
  assert.equal(out.eventStateDecisionArtifactSha256, hash(before)); assert.equal(out.targetSnapshotArtifactSha256, hash(readFileSync(f.input.targetInventoryPath))); assert.equal(out.productionImport, "HOLD");
  assert.deepEqual(readFileSync(f.input.stateDecisionPath), before); assert.equal(JSON.stringify(result).includes("SYN-E"), false);
});
test("forged T0 dependency identity and full inventory source/code/count drift reject before output", t => {
  for (const mutate of [f => { f.t0.records[1].expectedTargetId = "00000000-0000-4000-8000-000000000001"; f.write("t0.json", f.t0); }, f => { f.inventory.triple = { ...triple, codeSha: "c".repeat(40) }; f.syncInventory(); }, f => { f.inventory.sourceManifestSha256 = hash("wrong"); f.syncInventory(); }, f => { f.inventory.targetTableCounts.hr_contract = 1; f.syncInventory(); }]) {
    const f = fixture(t); mutate(f); stableFailure(() => materialize(f.input, { head: () => triple.codeSha })); assert.equal(existsSync(f.input.outputPath), false);
  }
});
test("existing exact event is reused, changed target stays review without overwrite", t => {
  const f = fixture(t); materialize(f.input, { head: () => triple.codeSha }); const out = JSON.parse(readFileSync(f.input.outputPath)), r = out.records.find(r => r.candidateDisposition === "insert");
  const observed = materializeProductionTargetInventory({ targetIdentityMaterial: "synthetic target", targetScope: { tenantId: out.targetScope.tenantId, parkId: out.targetScope.parkId }, records: [{ targetTable: "hr_employment_event", targetId: "11111111-1111-4111-8111-111111111111", targetVersion: 3, targetFields: { ...r.targetFields, source_effective_at: "2026-01-01T08:30:00.000000+08:00" }, derivedFields: { employee_id: f.t0.records[1].expectedTargetId } }] });
  f.inventory.records.push(structuredClone(observed.records[0])); f.inventory.targetTableCounts.hr_employment_event = 1; f.syncInventory();
  f.input.outputPath = join(dirname(f.input.outputPath), "exact.json"); const exact = materialize(f.input, { head: () => triple.codeSha }); assert.equal(exact.countByDisposition.skip_exact, 1);
  f.inventory.records[0].targetCanonicalSha256 = hash("different content"); f.syncInventory(); f.input.outputPath = join(f.root, "conflict.json"); const conflict = materialize(f.input, { head: () => triple.codeSha }); assert.equal(conflict.countByDisposition.review_target_collision, 1); assert.equal(conflict.status, "REVIEW_HOLD");
});
test("consistent fresh file hashes do not hide actual type usage or state attestation drift", () => {
  const i = inputs(); i.events[1].source.legacyEventType = i.typeDecision.decisions[1].sourceValue;
  i.events[1].sourceRowSha256 = hash(JSON.stringify(i.events[1].source, Object.keys(i.events[1].source).sort()));
  refreshEvents(i); stableFailure(() => verify(i));
  for (const key of ["sourceRowSha256", "machineAttestationSha256"]) {
    const j = inputs(), d = j.statePackage.dictionaries.at(-1);
    if (key === "sourceRowSha256") { d.items[0][key] = hash("tamper"); j.attest(); }
    else d[key] = hash("tamper");
    stableFailure(() => verify(j));
  }
});
test("target arguments are exclusive and source revalidation is never implicit", t => {
  for (const mutate of [f => { f.input.targetSnapshotPath = f.input.targetInventoryPath; }, f => { delete f.input.sourceManifestPath; }, f => { delete f.input.targetInventoryPath; }]) {
    const f = fixture(t); mutate(f); stableFailure(() => materialize(f.input, { head: () => triple.codeSha })); assert.equal(existsSync(f.input.outputPath), false);
  }
  const f = fixture(t); f.input.targetSnapshotPath = f.input.targetInventoryPath; delete f.input.targetInventoryPath; delete f.input.sourceManifestPath;
  assert.throws(() => materialize(f.input, { head: () => triple.codeSha }), e => e.code === "PRODUCTION_IMPORT_T1_DECISION_STATE_INVALID");
});
test("private file modes, links, total read budget and existing outputs remain protected", t => {
  for (const mutate of [f => chmodSync(f.input.typeDecisionPath, 0o644), f => { const p = join(f.root, "linked.json"); symlinkSync(f.input.typeDecisionPath, p); f.input.typeDecisionPath = p; }, f => linkSync(f.input.typeDecisionPath, join(f.root, "hard.json")), f => chmodSync(f.input.stagingDir, 0o755)]) {
    const f = fixture(t); mutate(f); stableFailure(() => materialize(f.input, { head: () => triple.codeSha })); assert.equal(existsSync(f.input.outputPath), false);
  }
  const f = fixture(t); stableFailure(() => materialize(f.input, { head: () => triple.codeSha, maximumReadBytes: 1024 })); assert.equal(existsSync(f.input.outputPath), false);
  materialize(f.input, { head: () => triple.codeSha }); const before = readFileSync(f.input.outputPath);
  stableFailure(() => materialize(f.input, { head: () => triple.codeSha })); assert.deepEqual(readFileSync(f.input.outputPath), before);
});
test("no accepted T0 employees retains all events as quarantine", t => {
  const f = fixture(t); f.t0.records = []; f.t0.countByDisposition.insert = 0; f.write("t0.json", f.t0);
  const result = materialize(f.input, { head: () => triple.codeSha });
  assert.equal(result.recordCount, 6887); assert.equal(result.countByDisposition.quarantine, 6887); assert.equal(result.status, "REVIEW_HOLD");
});
test("source business duplicates block every member instead of inserting the first", t => {
  const f = fixture(t); f.i.events[2].source.legacyEventNo = f.i.events[1].source.legacyEventNo;
  f.i.events[2].sourceRowSha256 = hash(JSON.stringify(f.i.events[2].source, Object.keys(f.i.events[2].source).sort())); refreshEvents(f.i);
  f.write("stage/employment-events.jsonl", f.i.stageBytes.employmentEvents); f.write("stage/manifest.json", f.i.stageManifestBytes); f.write("source.json", f.i.sourceManifest);
  const phase = JSON.parse(readFileSync(f.input.phaseArtifactPath)); phase.records[2].sourceRowSha256 = f.i.events[2].sourceRowSha256; f.write("phase.json", phase);
  f.inventory.sourceManifestSha256 = hash(canonical(f.i.sourceManifest)); f.syncInventory();
  const result = materialize(f.input, { head: () => triple.codeSha }); assert.equal(result.countByDisposition.review_target_collision, 2);
  const out = JSON.parse(readFileSync(f.input.outputPath)); assert.equal(out.records.filter(r => r.reasonCode === "SOURCE_BUSINESS_IDENTITY_COLLISION").length, 2);
});
test("a target ID belonging to another business identity cannot be reused", t => {
  const f = fixture(t); materialize(f.input, { head: () => triple.codeSha }); const out = JSON.parse(readFileSync(f.input.outputPath)), r = out.records.find(r => r.candidateDisposition === "insert");
  f.inventory.records.push({ targetTable: "hr_employment_event", businessIdentitySha256: hash("another business"), targetId: r.expectedTargetId, targetCanonicalSha256: hash("another canonical"), targetVersion: 1 });
  f.inventory.targetTableCounts.hr_employment_event = 1; f.syncInventory(); f.input.outputPath = join(f.root, "id-collision.json");
  const result = materialize(f.input, { head: () => triple.codeSha }); assert.equal(result.countByDisposition.review_target_collision, 1);
  assert.equal(JSON.parse(readFileSync(f.input.outputPath)).records.find(row => row.sourceIdentitySha256 === r.sourceIdentitySha256)?.reasonCode, "TARGET_ID_COLLISION");
});
test("T1 wall-clock timestamps preserve six digits and reject invalid or ambiguous inputs", () => {
  for (const [input, expected] of [["2026-01-01 08:30:00", "2026-01-01T08:30:00.000000+08:00"], ["2026-01-01T08:30:00.1+08:00", "2026-01-01T08:30:00.100000+08:00"], ["2024-02-29 23:59:59.123456", "2024-02-29T23:59:59.123456+08:00"]]) assert.equal(timestamp(input), expected);
  for (const input of [null, "0000-01-01 00:00:00", "2026-02-29 00:00:00", "2026-04-31 00:00:00", "2026-01-01 24:00:00", "2026-01-01 00:60:00", "2026-01-01 00:00:60", "2026-01-01 00:00:00.1234567", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00+07:00"]) assert.equal(timestamp(input), null);
});
test("T1 timestamp representation matches PostgreSQL literal casts without tables or writes", { skip: !process.env.YUZHOU_T1_TIMESTAMP_PG_CONTAINER }, () => {
  const container = process.env.YUZHOU_T1_TIMESTAMP_PG_CONTAINER; assert.match(container, /^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/u);
  const run = args => { try { return execFileSync("docker", args, { encoding: "utf8", timeout: 15000, maxBuffer: 65536, stdio: ["ignore", "pipe", "pipe"] }).trim(); } catch { assert.fail("T1_TIMESTAMP_PG_READONLY_CHECK_FAILED"); } };
  const context = run(["context", "show"]); assert.match(run(["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"]), /^unix:\/\//u);
  const sql = "BEGIN READ ONLY; SELECT json_build_array(to_char('2026-01-01T08:30:00'::timestamp,'YYYY-MM-DD\"T\"HH24:MI:SS.US')||'+08:00',to_char('2026-01-01T08:30:00.123456+08:00'::timestamp,'YYYY-MM-DD\"T\"HH24:MI:SS.US')||'+08:00')::text; ROLLBACK;";
  const values = JSON.parse(run(["exec", container, "psql", "-X", "-w", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", "postgres", "-c", sql]));
  assert.deepEqual(values, [timestamp("2026-01-01 08:30:00"), timestamp("2026-01-01 08:30:00.123456")]);
});
