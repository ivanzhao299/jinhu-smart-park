import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { projectProductionT3Fields as project, buildProductionT3AttendanceSupport as support } from "../hr-cutover/production-t3-field-projection.mjs";
import { materializeProductionT3PhaseArtifact } from "../hr-cutover/materialize-production-t3-phase-artifact.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, computeProductionImportTargetCanonicalHash as targetHash } from "../hr-cutover/production-import-target-model.mjs";
import { normalizeProductionImportTargetFields as normalize } from "../hr-cutover/production-import-payload-generator.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const kinds = ["oldage", "remedy", "losework", "fund", "wound", "bear"];
const fileHash = hash("synthetic attendance file");
function row(sourceTable, source, extra) { return { sourceTable, sourceKey: String(source.id), sourceIdentitySha256: hash(`${sourceTable}\0${source.id}`), sourceRowSha256: hash(`raw pretransform ${sourceTable} ${source.id}`), source, ...extra }; }
function calendar() { return row("dbo.timekeeptable", { id: 101, calendarName: "Synthetic calendar", year: 2024, month: 2 }, { days: Array.from({ length: 29 }, (_, index) => ({ day: index + 1, legacySymbol: ["普通班次", "晚上班", "unknown-synthetic"][index] ?? null })) }); }
function policy() { return row("dbo.insure_method", { id: 201, name: "Synthetic policy", scope: null }, { items: kinds.map(kind => ({ kind, variant: 1, baseRate: "0.16", employerRate: "0", employeeRate: null, supplementRate: "0.000001", baseFixedAmount: "1.234", employerFixedAmount: "0", employeeFixedAmount: null, supplementFixedAmount: "2.3" })) }); }
function insurance() { return row("dbo.person_insure", { id: 301, year: "2024", month: "2", employeeCode: "SYN-E" }, { items: kinds.map(kind => ({ kind, contributionBase: "100", totalAmount: "16.5", employerAmount: "0", employeeAmount: null, supplementAmount: "0.00", legacyBaseNegative: false, legacyFlag: null })) }); }
const validRows = rows => rows.filter(r => r.targetFields !== null);
const stableFailure = fn => assert.throws(fn, e => /^T3_[A-Z0-9_]+$/u.test(e.code ?? e.message));

test("all eight target field sets, source identities and dependency roles are complete and immutable", () => {
  const a = calendar(), p = policy(), i = insurance(), before = JSON.stringify([a, p, i]);
  const rows = [...support([a], fileHash), ...project(a, { attendanceFileSha256: fileHash }), ...project(p), ...project(i)];
  assert.equal(rows.length, 48); assert.equal(new Set(rows.map(r => r.sourceIdentitySha256)).size, rows.length);
  assert.deepEqual([...new Set(rows.map(r => r.targetTable))].sort(), Object.keys(model.targetTables).filter(k => model.targetTables[k].phase === "T3").sort());
  for (const r of rows) {
    assert.equal(r.phase, "T3"); assert.equal(r.sourcePkCanonical, `sha256:${r.sourceIdentitySha256}`); assert.match(r.sourceRowSha256, /^[a-f0-9]{64}$/u);
    if (r.targetFields === null) { assert.equal(r.reasonCode, "T3_ATTENDANCE_SYMBOL_UNRESOLVED"); continue; }
    const rule = model.targetTables[r.targetTable];
    assert.deepEqual(Object.keys(r.targetFields).sort(), [...rule.fieldWhitelist].sort());
    assert.deepEqual(normalize(r.targetTable, r.targetFields, rule), r.targetFields);
    assert.deepEqual(r.dependencyRefs.map(ref => ref.role).sort(), rule.foreignKeys.map(ref => ref.dependencyRole).sort());
    for (const ref of r.dependencyRefs) assert.deepEqual(Object.keys(ref).sort(), ["role", "phase", "sourceIdentitySha256", "expectedTargetTable"].sort());
  }
  assert.equal(JSON.stringify([a, p, i]), before);
  rows.find(r => r.targetTable === "hr_employee_insurance_period").targetFields.source_snapshot.legacyItems.oldage.legacyFlag = "mutated projection";
  assert.equal(JSON.stringify([a, p, i]), before);
});

test("attendance preserves blank and unknown symbols without inventing rules or verified batches", () => {
  const a = calendar(), rows = project(a, { attendanceFileSha256: fileHash }), days = rows.filter(r => r.targetTable === "hr_attendance_day"), rules = support([a], fileHash);
  assert.equal(days.length, 29); assert.equal(days[0].targetFields.normalized_kind, "standard_shift"); assert.equal(days[1].targetFields.normalized_kind, "night_shift");
  assert.equal(days[2].targetFields.legacy_symbol, "unknown-synthetic"); assert.equal(days[2].targetFields.symbol_status, "needs_review"); assert.equal(days[2].targetFields.normalized_kind, null);
  assert.equal(days[3].targetFields.symbol_status, "blank"); assert.equal(days[3].targetFields.legacy_symbol, null);
  const batch = rules.find(r => r.targetTable === "hr_attendance_import_batch"); assert.equal(batch.targetFields.status, "imported"); assert.equal(batch.targetFields.source_checksum, fileHash); assert.ok(batch.targetFields.batch_code.length <= 64);
  assert.deepEqual(support([a], fileHash), support([a], fileHash)); assert.notDeepEqual(support([a], hash("different file"))[0].sourceIdentitySha256, rules[0].sourceIdentitySha256);
});

test("rates are already fractional and each PostgreSQL numeric scale is preserved exactly", () => {
  const p = project(policy()).find(r => r.targetTable === "hr_insurance_policy_item").targetFields;
  assert.equal(p.base_rate, "0.160000"); assert.equal(p.supplement_rate, "0.000001"); assert.equal(p.base_fixed_amount, "1.234"); assert.equal(p.supplement_fixed_amount, "2.300");
  const i = project(insurance()).find(r => r.targetTable === "hr_employee_insurance_item").targetFields;
  assert.equal(i.contribution_base, "100.00"); assert.equal(i.total_amount, "16.50"); assert.equal(i.employer_amount, "0.00"); assert.equal(i.employee_amount, null);
  const trailing = policy(); trailing.items[0].baseRate = "000.16000000"; trailing.items[0].baseFixedAmount = "+01.234000";
  const normalized = project(trailing).find(r => r.targetTable === "hr_insurance_policy_item"); assert.equal(normalized.targetFields.base_rate, "0.160000"); assert.equal(normalized.targetFields.base_fixed_amount, "1.234");
});

test("precision, overflow and negative values quarantine only affected children without rounding", () => {
  for (const [field, value, code] of [["baseRate", "0.1234567", "T3_DECIMAL_PRECISION_LOSS"], ["baseFixedAmount", "1.2345", "T3_DECIMAL_PRECISION_LOSS"], ["baseRate", "1000000000000", "T3_DECIMAL_OVERFLOW"], ["baseFixedAmount", "-1", "T3_NEGATIVE_DECIMAL_UNSUPPORTED"], ["baseRate", 0.16, "T3_DECIMAL_INVALID"]]) {
    const p = policy(); p.items[0][field] = value; const rows = project(p); assert.equal(rows.length, 7); assert.equal(rows.filter(r => r.targetFields === null).length, 1); assert.equal(rows.find(r => r.targetFields === null).reasonCode, code);
  }
  const i = insurance(); i.items[0].totalAmount = "1.001"; const rows = project(i); assert.equal(rows.length, 7); assert.equal(rows.find(r => r.targetFields === null).reasonCode, "T3_DECIMAL_PRECISION_LOSS");
});

test("legacy flags and negative bases retain distinctions without interpreting eligibility", () => {
  const i = insurance(); i.items[0].legacyFlag = 0; i.items[1].legacyFlag = false; i.items[2].legacyFlag = "unknown"; i.items[3].legacyBaseNegative = true; i.items[3].contributionBase = null;
  const rows = project(i), parent = rows.find(r => r.targetTable === "hr_employee_insurance_period").targetFields;
  assert.equal(parent.needs_review, true); assert.equal(parent.source_snapshot.legacyItems.oldage.legacyFlag, 0); assert.equal(parent.source_snapshot.legacyItems.remedy.legacyFlag, false); assert.equal(parent.source_snapshot.legacyItems.losework.legacyFlag, "unknown"); assert.equal(parent.source_snapshot.legacyItems.bear.legacyFlag, null);
  const child = rows.find(r => r.targetFields?.insurance_kind === "fund"); assert.equal(child.targetFields.legacy_base_negative, true); assert.equal(child.targetFields.contribution_base, null); assert.equal(validRows(rows).length, 7);
  const contradictory = insurance(); contradictory.items[0].legacyBaseNegative = true; assert.equal(project(contradictory).find(r => r.targetFields === null).reasonCode, "T3_LEGACY_BASE_CONTRADICTION");
});

test("invalid parent dates, absent employee and target lengths retain projected coverage", () => {
  const a = calendar(); a.source.month = 13; const invalid = project(a, { attendanceFileSha256: fileHash }); assert.equal(invalid.length, 30); assert.equal(validRows(invalid).length, 0); assert.ok(invalid.every(r => r.reasonCode === "T3_CALENDAR_PERIOD_INVALID"));
  const i = insurance(); i.source.employeeCode = ""; assert.equal(project(i).length, 7); assert.ok(project(i).every(r => r.reasonCode === "T3_EMPLOYEE_REQUIRED"));
  const p = policy(); p.source.name = "x".repeat(201); assert.equal(project(p).length, 7); assert.ok(project(p).every(r => r.reasonCode === "T3_TEXT_LENGTH_INVALID"));
});

test("structural source drift, duplicate children and unmapped fields fail rather than disappear", () => {
  for (const mutate of [r => { r.sourceKey = "wrong"; }, r => { r.sourceIdentitySha256 = hash("wrong"); }, r => { r.source.newColumn = null; }, r => { r.items[0].newColumn = null; }, r => { r.items.push(structuredClone(r.items[0])); }]) { const i = insurance(); mutate(i); stableFailure(() => project(i)); }
  const a = calendar(); a.days.push({ ...a.days[0] }); stableFailure(() => project(a, { attendanceFileSha256: fileHash }));
  // Raw pre-transform hashes are not recomputable from reduced staging source.
  const i = insurance(); i.sourceRowSha256 = hash("another attested raw pretransform row"); assert.equal(project(i)[0].sourceRowSha256, i.sourceRowSha256);
});

test("empty source still has its batch and explicit empty child sets are not invented", () => {
  const rows = support([], fileHash); assert.equal(rows.length, 1); assert.equal(rows[0].targetTable, "hr_attendance_import_batch");
  const p = policy(); p.items = []; assert.equal(project(p).length, 1);
});

test("attested older policy layout retains all identities without fabricating absent fixed amounts", () => {
  const fixed = ["baseFixedAmount", "employerFixedAmount", "employeeFixedAmount", "supplementFixedAmount"];
  const p = policy();
  p.items = p.items.flatMap(item => [item, { ...item, variant: 2 }]);
  const current = project(p);
  for (const item of p.items) for (const key of fixed) delete item[key];
  const old = project(p);
  assert.equal(old.length, 13);
  assert.deepEqual(old.map(r => r.sourceIdentitySha256), current.map(r => r.sourceIdentitySha256));
  assert.notEqual(old[0].targetFields, null);
  assert.ok(old.slice(1).every(r => r.targetFields === null && r.reasonCode === "T3_POLICY_FIXED_AMOUNTS_UNATTESTED"));
  const partial = policy(); delete partial.items[0].baseFixedAmount;
  stableFailure(() => project(partial));
  const unknown = structuredClone(p); unknown.items[0].unreviewedField = null;
  stableFailure(() => project(unknown));
  const emptyComplete = policy(); for (const item of emptyComplete.items) for (const key of fixed) item[key] = null;
  assert.ok(project(emptyComplete).every(r => r.targetFields !== null));
});

test("projection provenance exactly matches the existing receipt-bound T3 phase producer", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hr-t3-projection-"))); chmodSync(root, 0o700); t.after(() => rmSync(root, { recursive: true, force: true }));
  const stage = join(root, "stage"); mkdirSync(stage, { mode: 0o700 });
  const write = (path, value) => { writeFileSync(path, value, { mode: 0o600 }); return hash(value); };
  const domains = {}, inputs = { attendance: [calendar()], policies: [policy()], insurance: [insurance()] };
  for (const [domain, rows] of Object.entries(inputs)) { const file = `${domain}.jsonl`, bytes = rows.map(r => JSON.stringify(r) + "\n").join(""); domains[domain] = { rows: rows.length, file, fileSha256: write(join(stage, file), bytes) }; }
  const stageHash = write(join(stage, "manifest.json"), JSON.stringify({ formatVersion: 1, domains }) + "\n"), triple = { codeSha: "a".repeat(40), sourceSnapshotHash: hash("source"), mappingContractHash: hash("mapping") };
  const required = { T0: ["departments", "employeeJobStates", "employees", "jobStateCodeMetadata", "jobStateCodes", "positions"], T1: ["employmentEventStates", "employmentEventTypes", "employmentEvents"], T2: ["dbo.compact", "dbo.compact.state", "dbo.compact_c", "dbo.compacttypecode"], T3: Object.keys(domains) };
  const sourceManifest = { formatVersion: 1, artifactKind: "yuzhou_hr_production_source_manifest", sourceReadOnly: true, sourceSnapshotSha256: triple.sourceSnapshotHash, sourceRestoreReceiptSha256: hash("receipt"), sourceCatalogSha256: hash("catalog"), mappingContractSha256: triple.mappingContractHash, productionImport: "HOLD", phases: Object.fromEntries(Object.entries(required).map(([phase, names]) => [phase, { stageManifestSha256: phase === "T3" ? stageHash : hash(phase), domains: Object.fromEntries(names.map(name => [name, phase === "T3" ? { rows: domains[name].rows, fileSha256: domains[name].fileSha256 } : { rows: 0, fileSha256: hash(name) }])) }])) };
  const triplePath = join(root, "triple.json"), sourceManifestPath = join(root, "source.json"), outputPath = join(root, "phase.json"); write(triplePath, JSON.stringify(triple)); write(sourceManifestPath, JSON.stringify(sourceManifest));
  materializeProductionT3PhaseArtifact({ stagingDir: stage, triplePath, sourceManifestPath, outputPath }, { head: () => triple.codeSha });
  const expected = JSON.parse(readFileSync(outputPath)).records;
  const ah = domains.attendance.fileSha256, actual = [...support(inputs.attendance, ah), ...project(inputs.attendance[0], { attendanceFileSha256: ah }), ...project(inputs.policies[0]), ...project(inputs.insurance[0])];
  const provenance = rows => rows.map(({ phase, targetTable, sourceSystem, sourceTable, sourcePkCanonical, sourceIdentitySha256, sourceRowSha256 }) => ({ phase, targetTable, sourceSystem, sourceTable, sourcePkCanonical, sourceIdentitySha256, sourceRowSha256 })).sort((a, b) => a.sourceIdentitySha256.localeCompare(b.sourceIdentitySha256));
  assert.deepEqual(provenance(actual), provenance(expected));
  // The existing phase producer must also accept the exact older attested layout,
  // while the field projector keeps its unproven semantics explicitly unresolved.
  const oldPolicy = structuredClone(inputs.policies[0]);
  for (const item of oldPolicy.items) for (const key of ["baseFixedAmount", "employerFixedAmount", "employeeFixedAmount", "supplementFixedAmount"]) delete item[key];
  domains.policies.fileSha256 = write(join(stage, "policies.jsonl"), JSON.stringify(oldPolicy) + "\n");
  sourceManifest.phases.T3.domains.policies.fileSha256 = domains.policies.fileSha256;
  sourceManifest.phases.T3.stageManifestSha256 = write(join(stage, "manifest.json"), JSON.stringify({ formatVersion: 1, domains }) + "\n");
  write(sourceManifestPath, JSON.stringify(sourceManifest));
  const oldOutput = join(root, "old-phase.json");
  materializeProductionT3PhaseArtifact({ stagingDir: stage, triplePath, sourceManifestPath, outputPath: oldOutput }, { head: () => triple.codeSha });
  const oldActual = [...support(inputs.attendance, ah), ...project(inputs.attendance[0], { attendanceFileSha256: ah }), ...project(oldPolicy), ...project(inputs.insurance[0])];
  assert.deepEqual(provenance(oldActual), provenance(JSON.parse(readFileSync(oldOutput)).records));
});

test("T3 decimal fields match actual PostgreSQL canonical text with no business table writes", { skip: !process.env.YUZHOU_T3_PROJECTION_PG_CONTAINER }, () => {
  const container = process.env.YUZHOU_T3_PROJECTION_PG_CONTAINER; assert.match(container, /^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/u);
  const run = args => { try { return execFileSync("docker", args, { encoding: "utf8", timeout: 15000, maxBuffer: 65536, stdio: ["ignore", "pipe", "pipe"] }).trim(); } catch { assert.fail("T3_PROJECTION_PG_READONLY_CHECK_FAILED"); } };
  const context = run(["context", "show"]); assert.match(run(["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"]), /^unix:\/\//u);
  const sql = "BEGIN READ ONLY; SELECT json_build_object('rate',('0.16'::numeric(18,6))::text,'fixed',('1.234'::numeric(18,3))::text,'amount',('16.5'::numeric(18,2))::text)::text; ROLLBACK;";
  const stored = JSON.parse(run(["exec", container, "psql", "-X", "-w", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", "postgres", "-c", sql])), p = project(policy()).find(r => r.targetTable === "hr_insurance_policy_item"), i = project(insurance()).find(r => r.targetTable === "hr_employee_insurance_item");
  assert.equal(p.targetFields.base_rate, stored.rate); assert.equal(p.targetFields.base_fixed_amount, stored.fixed); assert.equal(i.targetFields.total_amount, stored.amount);
  const scope = { tenantId: "SYN-T", parkId: "SYN-P" }; assert.equal(targetHash(p.targetTable, scope, p.targetFields), targetHash(p.targetTable, scope, { ...p.targetFields, base_rate: stored.rate, base_fixed_amount: stored.fixed }));
});
