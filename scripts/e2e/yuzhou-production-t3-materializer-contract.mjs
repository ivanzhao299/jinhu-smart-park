import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { materializeProductionT3DecisionCandidates as materialize } from "../hr-cutover/materialize-production-t3-decision-candidates.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, stableProductionImportCanonicalJson as canonical,
  computeProductionImportBusinessIdentityHash as businessHash, deriveProductionImportTargetId as deriveId } from "../hr-cutover/production-import-target-model.mjs";
import { computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CLI = "scripts/hr-cutover/materialize-production-t3-decision-candidates.mjs";
const hash = value => createHash("sha256").update(value).digest("hex");
const code = "a".repeat(40), options = { currentHead: () => code };
const SENTINEL = "SYNTHETIC_PRIVATE_中文_SENTINEL";
const kinds = ["oldage", "remedy", "losework", "fund", "wound", "bear"];
const files = { attendance: ["attendance.jsonl", "dbo.timekeeptable"], policies: ["policies.jsonl", "dbo.insure_method"], insurance: ["insurance.jsonl", "dbo.person_insure"] };
const outputs = ["t3-phase.json", "t3-candidates.json", "t3-policy-lineage.json"];
const receiptName = "t3-materialization-receipt.json";
function staged(sourceTable, source, children) {
  return { sourceTable, sourceKey: String(source.id), sourceIdentitySha256: hash(`${sourceTable}\0${source.id}`), sourceRowSha256: hash(`synthetic ${sourceTable} ${source.id}`), source, ...children };
}
function policy(legacy = false) {
  if (!legacy) return staged("dbo.insure_method", { id: 201, name: SENTINEL, scope: null }, { items: kinds.map(kind => ({ kind, variant: 1,
    baseRate: "0.16", employerRate: "0", employeeRate: null, supplementRate: "0.000001", baseFixedAmount: "1.234", employerFixedAmount: "0", employeeFixedAmount: null, supplementFixedAmount: "2.3" })) });
  const raw = { id: 201, des: SENTINEL, rightscope: "0" }, slots = [["baseRate", ""], ["employerRate", "_e"], ["employeeRate", "_p"], ["supplementRate", "_pc"]];
  for (const kind of kinds) for (const [, suffix] of slots) { raw[`${kind}${suffix}`] = "16.000"; raw[`${kind}${suffix}2`] = "12.345"; }
  return { ...staged("dbo.insure_method", { id: 201, name: raw.des, scope: raw.rightscope }, {}), sourceRowSha256: hash(canonical(raw)),
    items: kinds.flatMap(kind => [1, 2].map(variant => ({ kind, variant, ...Object.fromEntries(slots.map(([field, suffix]) => [field, raw[`${kind}${suffix}${variant === 2 ? "2" : ""}`]])) }))) };
}
function insurance(id = 301, employeeCode = "SYN-E") {
  return staged("dbo.person_insure", { id, employeeCode, year: "2024", month: "2" }, { items: kinds.map(kind => ({ kind,
    contributionBase: "100", totalAmount: "16.5", employerAmount: "0", employeeAmount: null, supplementAmount: "0.00", legacyBaseNegative: false, legacyFlag: null })) });
}
function fixture(t, { empty = false, legacy = false, head = code } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "hr-t3-materializer-test-")));
  fs.chmodSync(root, 0o700); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stagingDir = join(root, "stage"), outputDir = join(root, "output");
  for (const path of [stagingDir, outputDir]) fs.mkdirSync(path, { mode: 0o700 });
  const write = (name, value, raw = false) => {
    const path = join(root, name), data = raw ? value : JSON.stringify(value) + "\n";
    fs.writeFileSync(path, data, { mode: 0o600 }); return { path, sha256: hash(data) };
  };
  const triple = { codeSha: head, sourceSnapshotHash: hash("source"), mappingContractHash: hash("mapping") };
  const scope = { tenantId: "SYN-T", parkId: "SYN-P" }; scope.scopeSha256 = computeProductionImportTargetScopeHash(scope);
  const records = empty ? [] : [staged("dbo.timekeeptable", { id: 101, calendarName: SENTINEL, year: 2024, month: 2 },
    { days: [{ day: 1, legacySymbol: "普通班次" }, { day: 2, legacySymbol: "晚上班" }, { day: 3, legacySymbol: null }] }), policy(legacy), insurance()];
  const stage = { formatVersion: 1, domains: {}, sourceSnapshotSha256: triple.sourceSnapshotHash, sourceRestoreReceiptSha256: hash("receipt"), sourceCatalogSha256: hash("catalog"), mappingContractSha256: triple.mappingContractHash, productionImport: "HOLD" };
  const source = { formatVersion: 1, artifactKind: "yuzhou_hr_production_source_manifest", sourceReadOnly: true,
    sourceSnapshotSha256: triple.sourceSnapshotHash, sourceRestoreReceiptSha256: hash("receipt"), sourceCatalogSha256: hash("catalog"), mappingContractSha256: triple.mappingContractHash, phases: {}, productionImport: "HOLD" };
  const names = { T0: ["departments", "employeeJobStates", "employees", "jobStateCodeMetadata", "jobStateCodes", "positions"], T1: ["employmentEventStates", "employmentEventTypes", "employmentEvents"], T2: ["dbo.compact", "dbo.compact.state", "dbo.compact_c", "dbo.compacttypecode"], T3: Object.keys(files) };
  for (const [phase, domains] of Object.entries(names)) source.phases[phase] = { stageManifestSha256: hash(phase), domains: Object.fromEntries(domains.map(name => [name, { rows: 0, fileSha256: hash(name) }])) };
  const inventory = { formatVersion: 1, kind: "yuzhou_hr_production_target_inventory_readonly", status: "PASS", productionImport: "HOLD", executionReachable: false,
    targetIdentitySha256: hash("target"), targetScopeSha256: scope.scopeSha256, sourceManifestSha256: "", triple: { ...triple }, targetTableCounts: Object.fromEntries(Object.keys(model.targetTables).map(table => [table, 0])), records: [] };
  function t0row(table, sourceTable, key, fields, parents = []) {
    const identity = hash(`${sourceTable}\0${key}`), allFields = { ...Object.fromEntries(model.targetTables[table].nullableFields.map(key => [key, null])), ...fields };
    const derived = Object.fromEntries(parents.map(([role, parent]) => [model.targetTables[table].foreignKeys.find(fk => fk.dependencyRole === role).column, parent.expectedTargetId]));
    return { phase: "T0", targetTable: table, sourceSystem: "yuzhou-v10", sourceTable, sourcePkCanonical: `sha256:${identity}`, sourceIdentitySha256: identity,
      sourceRowSha256: hash(key), candidateDisposition: "insert", reasonCode: null, targetFields: allFields,
      dependencyRefs: parents.map(([role, parent]) => ({ role, phase: "T0", sourceIdentitySha256: parent.sourceIdentitySha256, expectedTargetTable: parent.targetTable })),
      businessIdentitySha256: businessHash(table, scope, allFields, derived), expectedTargetId: deriveId({ targetScope: scope, targetTable: table, sourceIdentitySha256: identity }), expectedTargetVersion: null, expectedTargetCanonicalSha256: null };
  }
  const org = t0row("sys_org", "dbo.departmentcode", "SYN-O", { org_code: "SYN-O", org_name: SENTINEL, org_type: "department", sort_order: 0, status: "enabled" });
  const employee = t0row("hr_employee", "dbo.person", "SYN-E", { employee_code: "SYN-E", full_name: SENTINEL, employment_type: "full_time", employment_status: "active" }, [["primary_org", org]]);
  const t0 = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_t0_decision_candidates", triple: { ...triple }, phaseArtifactSha256: hash("t0phase"), targetInventoryArtifactSha256: "", targetIdentitySha256: inventory.targetIdentitySha256, targetScope: scope,
    jobStateDecisionArtifactSha256: hash("jobstate"), status: "READY_FOR_FREEZE", countByDisposition: { insert: 2, skip_exact: 0, review_target_collision: 0, quarantine: 0 }, records: [org, employee], productionImport: "HOLD" };
  const config = { formatVersion: 1, triple, stagingDir, artifacts: {}, outputDir };
  const save = () => write("config.json", config), saveInventory = () => {
    config.artifacts.targetInventory = write("inventory.json", inventory);
    t0.targetInventoryArtifactSha256 = config.artifacts.targetInventory.sha256;
    config.artifacts.t0Candidates = write("t0.json", t0); save();
  };
  const bind = () => {
    source.phases.T3.stageManifestSha256 = write("stage/manifest.json", stage).sha256;
    source.phases.T3.domains = Object.fromEntries(Object.entries(stage.domains).map(([key, item]) => [key, { rows: item.rows, fileSha256: item.fileSha256 }]));
    config.artifacts.sourceManifest = write("source.json", source);
    inventory.sourceManifestSha256 = hash(canonical(source)); saveInventory();
  };
  const stageRecords = () => {
    for (const [domain, [file, table]] of Object.entries(files)) {
      const rows = records.filter(row => row.sourceTable === table), descriptor = write(`stage/${file}`, rows.map(row => JSON.stringify(row) + "\n").join(""), true);
      stage.domains[domain] = { rows: rows.length, file, fileSha256: descriptor.sha256 };
    }
    bind();
  };
  stageRecords();
  return { root, config, path: join(root, "config.json"), records, stage, source, inventory, t0, write, save, bind, saveInventory, stageRecords };
}
const read = (f, name) => JSON.parse(fs.readFileSync(join(f.config.outputDir, name), "utf8"));
const reject = (f, code, opts = options) => {
  assert.throws(() => materialize(f.path, opts), error => error.code === code && error.message === code);
  assert.equal(fs.existsSync(join(f.config.outputDir, receiptName)), false);
};
function patchFs(t, name, implementation) {
  const original = fs[name]; fs[name] = (...args) => implementation(original, ...args); syncBuiltinESMExports();
  t.after(() => { fs[name] = original; syncBuiltinESMExports(); });
}

test("authenticated three-domain IO creates canonical phase/candidates/lineage and a last hash-only receipt", t => {
  const f = fixture(t, { legacy: true });
  const paths = [f.path, ...Object.values(f.config.artifacts).map(a => a.path), ...fs.readdirSync(f.config.stagingDir).map(name => join(f.config.stagingDir, name))];
  const before = paths.map(path => hash(fs.readFileSync(path)));
  const writes = [], originalOpen = fs.openSync;
  patchFs(t, "openSync", (original, path, flags, mode) => { if (String(path).startsWith(f.config.outputDir) && (flags & fs.constants.O_CREAT)) writes.push(String(path)); return original(path, flags, mode); });
  const result = materialize(f.path, options), phase = read(f, outputs[0]), candidates = read(f, outputs[1]), lineage = read(f, outputs[2]), receipt = read(f, receiptName);
  assert.equal(result.status, "READY_FOR_REVIEW"); assert.equal(result.recordCount, 21);
  assert.deepEqual(result.targetTableCounts, { hr_attendance_import_batch: 1, hr_attendance_symbol_rule: 2, hr_attendance_calendar_source: 1, hr_attendance_day: 3, hr_insurance_policy: 1, hr_insurance_policy_item: 6, hr_employee_insurance_period: 1, hr_employee_insurance_item: 6 });
  assert.equal(result.recoveredPolicyCount, 1); assert.equal(lineage.records.length, 1);
  assert.equal(lineage.records[0].lineage.length, 6); assert.ok(lineage.records[0].lineage.every(link => link.sourceProjections.length === 2));
  assert.ok(candidates.records.filter(row => row.targetTable === "hr_insurance_policy_item").every(row => row.targetFields.base_rate === "0.160000" && row.targetFields.base_fixed_amount === "12.345"));
  assert.equal(candidates.phaseArtifactSha256, hash(fs.readFileSync(join(f.config.outputDir, outputs[0]))));
  assert.equal(candidates.phaseArtifactSha256, hash(canonical(phase) + "\n"));
  for (const name of outputs) {
    const path = join(f.config.outputDir, name), bytes = fs.readFileSync(path);
    assert.equal(bytes.toString(), canonical(JSON.parse(bytes)) + "\n");
    assert.deepEqual(receipt.artifacts[name], { sha256: hash(bytes), bytes: bytes.length });
    assert.equal(fs.statSync(path).mode & 0o7777, 0o600);
  }
  assert.equal(writes.at(-1), join(f.config.outputDir, receiptName)); assert.equal(writes.length, 4);
  assert.equal(receipt.materializationStatus, "COMPLETE"); assert.equal(receipt.productionImport, "HOLD"); assert.equal(receipt.approvalClaimed, false);
  assert.equal(receipt.sourceManifestSha256, hash(canonical(f.source))); assert.notEqual(receipt.sourceManifestSha256, f.config.artifacts.sourceManifest.sha256);
  for (const source of Object.values(receipt.sources)) assert.deepEqual(Object.keys(source).sort(), ["bytes", "rows", "sha256"]);
  assert.deepEqual(paths.map(path => hash(fs.readFileSync(path))), before);
  for (const safe of [result, receipt]) for (const secret of [SENTINEL, f.root, "SYN-E", "12.345"]) assert.equal(JSON.stringify(safe).includes(secret), false);
  assert.equal(fs.statSync(join(f.config.outputDir, receiptName)).mode & 0o7777, 0o600);
  fs.openSync = originalOpen; syncBuiltinESMExports();
});
test("current policy values keep their fractional semantics; zero domains still produce a batch and eight counts", t => {
  const current = fixture(t); assert.equal(materialize(current.path, options).recoveredPolicyCount, 0);
  assert.equal(read(current, outputs[1]).records.find(row => row.targetTable === "hr_insurance_policy_item").targetFields.base_rate, "0.160000");
  const empty = fixture(t, { empty: true }), result = materialize(empty.path, options);
  assert.equal(result.recordCount, 1); assert.equal(Object.keys(result.targetTableCounts).length, 8);
  assert.equal(Object.values(result.targetTableCounts).filter(Boolean).length, 1);
  assert.deepEqual(read(empty, outputs[2]).records, []);
});
test("actual materialized rows conserve duplicates, missing employees, invalid semantics and unknown symbols", t => {
  const f = fixture(t); f.records.push(insurance(302), insurance(303, "MISSING"), insurance(304)); f.records.at(-1).source.month = "13";
  f.records[0].days[0].legacySymbol = "N1"; f.stageRecords();
  const result = materialize(f.path, options), rows = read(f, outputs[1]).records;
  assert.equal(result.status, "REVIEW_HOLD"); assert.equal(result.recordCount, 42);
  assert.equal(rows.filter(row => row.reasonCode === "T3_SOURCE_BUSINESS_COLLISION").length, 2);
  assert.equal(rows.filter(row => row.reasonCode === "T3_PARENT_REQUIRES_REVIEW").length, 18);
  assert.equal(rows.filter(row => row.reasonCode === "T3_CALENDAR_PERIOD_INVALID").length, 7);
  assert.equal(rows.find(row => row.targetTable === "hr_attendance_day" && row.targetFields?.legacy_symbol === "N1").targetFields.legacy_symbol, "N1");
});
test("C/S/M, source descriptors, target canonical source hash and full T0/inventory bindings are fail closed", t => {
  for (const field of ["codeSha", "sourceSnapshotHash", "mappingContractHash"]) {
    const f = fixture(t); f.inventory.triple[field] = field === "codeSha" ? "b".repeat(40) : hash("stale"); f.saveInventory(); reject(f, "T3_CANDIDATE_INVENTORY_INVALID");
    const g = fixture(t); g.t0.triple[field] = field === "codeSha" ? "b".repeat(40) : hash("stale"); g.saveInventory(); reject(g, "T3_CANDIDATE_T0_BINDING_INVALID");
  }
  const wrongHead = fixture(t); reject(wrongHead, "T3_MATERIALIZER_CURRENT_CODE_REQUIRED", { currentHead: () => "b".repeat(40) });
  const changedHead = fixture(t); let calls = 0; reject(changedHead, "T3_MATERIALIZER_CURRENT_CODE_REQUIRED", { currentHead: () => calls++ ? "b".repeat(40) : code });
  const raw = fixture(t); raw.inventory.sourceManifestSha256 = raw.config.artifacts.sourceManifest.sha256; raw.saveInventory(); reject(raw, "T3_MATERIALIZER_INVENTORY_SOURCE_DRIFT");
  const target = fixture(t); target.t0.targetIdentitySha256 = hash("wrong target"); target.saveInventory(); reject(target, "T3_CANDIDATE_T0_BINDING_INVALID");
  const scope = fixture(t); scope.inventory.targetScopeSha256 = hash("wrong scope"); scope.saveInventory(); reject(scope, "T3_CANDIDATE_INVENTORY_INVALID");
  const tables = fixture(t); delete tables.inventory.targetTableCounts.hr_contract; tables.saveInventory(); reject(tables, "T3_CANDIDATE_INVENTORY_INVALID");
  for (const name of ["sourceManifest", "targetInventory", "t0Candidates"]) {
    const f = fixture(t); f.config.artifacts[name].sha256 = hash("wrong bytes"); f.save(); reject(f, "T3_MATERIALIZER_ARTIFACT_HASH_MISMATCH");
  }
  for (const field of ["sourceSnapshotSha256", "mappingContractSha256"]) {
    const f = fixture(t); f.source[field] = hash("stale source"); f.bind(); reject(f, "T3_MATERIALIZER_SOURCE_MANIFEST_DRIFT");
  }
});
test("all fixed stage hashes/counts, optional receipts and structural layouts are authenticated before outputs", t => {
  for (const [domain, [file]] of Object.entries(files)) {
    const bytes = fixture(t); fs.appendFileSync(join(bytes.config.stagingDir, file), "\n"); reject(bytes, "T3_MATERIALIZER_STAGE_BYTES_DRIFT");
    const count = fixture(t); count.stage.domains[domain].rows++; count.bind(); reject(count, "T3_MATERIALIZER_STAGE_COUNT_DRIFT");
    const name = fixture(t); name.stage.domains[domain].file = "wrong.jsonl"; name.bind(); reject(name, "T3_MATERIALIZER_STAGE_BINDING_DRIFT");
  }
  const manifest = fixture(t); fs.appendFileSync(join(manifest.config.stagingDir, "manifest.json"), "\n"); reject(manifest, "T3_MATERIALIZER_STAGE_MANIFEST_DRIFT");
  for (const key of ["sourceSnapshotSha256", "sourceRestoreReceiptSha256", "sourceCatalogSha256", "mappingContractSha256", "productionImport"]) {
    const f = fixture(t); f.stage[key] = "wrong"; f.bind(); reject(f, "T3_MATERIALIZER_STAGE_BINDING_DRIFT");
  }
  const domain = fixture(t); domain.stage.domains.extra = { rows: 0, fileSha256: hash("extra") }; domain.bind(); reject(domain, "T3_MATERIALIZER_SOURCE_MANIFEST_INVALID");
  const structural = fixture(t); structural.records[0].source.extra = SENTINEL; structural.stageRecords(); reject(structural, "T3_MATERIALIZER_STAGE_INVALID");
  const partial = fixture(t, { legacy: true }); partial.records[1].items.pop(); partial.stageRecords(); reject(partial, "T3_POLICY_RECOVERY_LAYOUT_INVALID");
  const rawPolicy = fixture(t, { legacy: true }); rawPolicy.records[1].source.name = "changed"; rawPolicy.stageRecords(); reject(rawPolicy, "T3_POLICY_RECOVERY_RAW_HASH_MISMATCH");
});
test("fatal UTF8, nonempty malformed lines and 1MiB lines fail without silently dropping source rows", t => {
  for (const data of [Buffer.from([0xff, 10]), Buffer.from(" \n"), Buffer.from("{}\n"), Buffer.alloc(1024 ** 2 + 1, 32)]) {
    const f = fixture(t); const descriptor = f.write("stage/attendance.jsonl", data, true); f.stage.domains.attendance.fileSha256 = descriptor.sha256; f.bind();
    reject(f, data.length > 1024 ** 2 ? "T3_MATERIALIZER_LINE_TOO_LARGE" : data.toString() === "{}\n" ? "T3_MATERIALIZER_STAGE_INVALID" : "T3_MATERIALIZER_JSON_INVALID");
    assert.deepEqual(fs.readdirSync(f.config.outputDir), []);
  }
});
test("cross-64KiB Unicode lines, missing final newline and blank empty lines retain exact counts", t => {
  const f = fixture(t); f.records[2].items[0].legacyFlag = "中".repeat(24000); f.stageRecords();
  const file = join(f.config.stagingDir, "insurance.jsonl"), bytes = fs.readFileSync(file);
  const changed = Buffer.concat([Buffer.from("\n"), bytes.subarray(0, bytes.length - 1)]);
  f.stage.domains.insurance.fileSha256 = f.write("stage/insurance.jsonl", changed, true).sha256; f.bind();
  const readSizes = [], writeSizes = [];
  patchFs(t, "readSync", (original, fd, buffer, offset, length, position) => { readSizes.push(length); return original(fd, buffer, offset, length, position); });
  patchFs(t, "writeSync", (original, fd, buffer, offset, length) => { writeSizes.push(length); return original(fd, buffer, offset, Math.min(length, 10000)); });
  assert.equal(materialize(f.path, options).recordCount, 21);
  assert.ok(readSizes.every(size => size <= 65536)); assert.ok(writeSizes.every(size => size <= 65536));
  const period = read(f, outputs[1]).records.find(row => row.targetTable === "hr_employee_insurance_period");
  assert.equal(period.targetFields.source_snapshot.legacyItems.oldage.legacyFlag, f.records[2].items[0].legacyFlag);
});
test("config/metadata/stage/aggregate input limits reject before large allocation", t => {
  for (const [name, length] of [["config.json", 1024 ** 2 + 1], ["inventory.json", 32 * 1024 ** 2 + 1], ["stage/insurance.jsonl", 64 * 1024 ** 2 + 1]]) {
    const f = fixture(t); fs.truncateSync(join(f.root, name), length); reject(f, "T3_MATERIALIZER_FILE_TOO_LARGE");
  }
  const f = fixture(t); reject(f, "T3_MATERIALIZER_READ_BUDGET_EXCEEDED", { ...options, maximumReadBytes: 1024 });
  for (const cap of [0, -1, 128 * 1024 ** 2 + 1, 1.5]) reject(f, "T3_MATERIALIZER_READ_BUDGET_INVALID", { ...options, maximumReadBytes: cap });
});
test("unsafe modes, symlinks, hardlinks, directory aliases and existing output paths never overwrite evidence", t => {
  for (const name of ["config.json", "inventory.json", "stage/attendance.jsonl"]) {
    const mode = fixture(t); fs.chmodSync(join(mode.root, name), 0o644); reject(mode, "T3_MATERIALIZER_FILE_UNSAFE");
    const link = fixture(t); fs.linkSync(join(link.root, name), join(link.root, "extra-link")); reject(link, "T3_MATERIALIZER_FILE_UNSAFE");
    const symbolic = fixture(t), path = join(symbolic.root, name); fs.renameSync(path, path + ".original"); fs.symlinkSync(path + ".original", path); reject(symbolic, "T3_MATERIALIZER_FILE_UNSAFE");
  }
  const dir = fixture(t); fs.chmodSync(dir.config.outputDir, 0o755); reject(dir, "T3_MATERIALIZER_DIRECTORY_UNSAFE");
  const same = fixture(t); same.config.outputDir = same.config.stagingDir; same.save(); reject(same, "T3_MATERIALIZER_OUTPUT_INVALID");
  const collision = fixture(t), existing = join(collision.config.outputDir, outputs[0]); fs.writeFileSync(existing, SENTINEL, { mode: 0o600 });
  reject(collision, "T3_MATERIALIZER_OUTPUT_NOT_EMPTY"); assert.equal(fs.readFileSync(existing, "utf8"), SENTINEL);
  const alias = fixture(t); fs.symlinkSync(alias.config.outputDir, join(alias.root, "alias")); alias.config.outputDir = join(alias.root, "alias"); alias.save(); reject(alias, "T3_MATERIALIZER_DIRECTORY_UNSAFE");
});
test("inode replacement and permission drift while reading are rejected with stable codes", t => {
  const f = fixture(t), path = join(f.config.stagingDir, "attendance.jsonl"); let changed = false;
  patchFs(t, "readSync", (original, fd, buffer, offset, length, position) => {
    const result = original(fd, buffer, offset, length, position);
    if (!changed && buffer.subarray(offset, offset + result).includes(Buffer.from("dbo.timekeeptable"))) { changed = true; fs.chmodSync(path, 0o640); }
    return result;
  });
  reject(f, "T3_MATERIALIZER_FILE_CHANGED"); assert.ok(changed);
});
test("output limit preflight rejects oversized single and aggregate artifacts before creating any file", t => {
  const original = Buffer.byteLength;
  t.after(() => { Buffer.byteLength = original; });
  for (const [extra, code] of [[385 * 1024 ** 2, "T3_MATERIALIZER_OUTPUT_TOO_LARGE"], [350 * 1024 ** 2, "T3_MATERIALIZER_OUTPUT_BUDGET_EXCEEDED"]]) {
    const f = fixture(t); Buffer.byteLength = (value, ...args) => original(value, ...args) + (value === '"artifactKind":' ? extra : 0);
    reject(f, code); assert.deepEqual(fs.readdirSync(f.config.outputDir), []);
  }
});
test("a late output write failure preserves the exclusively reserved partial set and has no completion receipt", t => {
  const f = fixture(t); let writes = 0;
  patchFs(t, "writeSync", (original, ...args) => { if (++writes === 2) throw new Error(SENTINEL + f.root); return original(...args); });
  reject(f, "T3_MATERIALIZER_OUTPUT_FAILED");
  assert.deepEqual(fs.readdirSync(f.config.outputDir).sort(), [...outputs].sort());
  assert.ok(fs.statSync(join(f.config.outputDir, outputs[0])).size > 0);
  reject(f, "T3_MATERIALIZER_OUTPUT_NOT_EMPTY");
});
test("readback byte corruption blocks the final receipt and preserves partial artifacts", t => {
  const f = fixture(t); let changed = false;
  patchFs(t, "writeSync", (original, fd, buffer, offset, length) => {
    if (!changed) { changed = true; const corrupt = Buffer.from(buffer); corrupt[offset] ^= 1; return original(fd, corrupt, offset, length); }
    return original(fd, buffer, offset, length);
  });
  reject(f, "T3_MATERIALIZER_OUTPUT_READBACK_FAILED"); assert.equal(fs.readdirSync(f.config.outputDir).length, 3);
});
test("receipt write and final directory fsync failures remove only this run's completion marker", async t => {
  for (const failure of ["write", "fsync"]) await t.test(failure, child => {
    const f = fixture(child); let markerFd, failed = false;
    patchFs(child, "openSync", (original, path, ...args) => {
      const fd = original(path, ...args);
      if (path === join(f.config.outputDir, receiptName) && (args[0] & fs.constants.O_CREAT)) markerFd = fd;
      return fd;
    });
    patchFs(child, failure === "write" ? "writeSync" : "fsyncSync", (original, fd, ...args) => {
      if (!failed && markerFd !== undefined && (failure === "write" ? fd === markerFd : fs.fstatSync(fd).isDirectory())) {
        failed = true;
        if (failure === "write") original(fd, ...args); // Complete JSON can exist before the error.
        throw new Error(SENTINEL);
      }
      return original(fd, ...args);
    });
    reject(f, "T3_MATERIALIZER_OUTPUT_FAILED"); assert.ok(failed);
    assert.deepEqual(fs.readdirSync(f.config.outputDir).sort(), [...outputs].sort());
    for (const file of outputs) assert.ok(fs.statSync(join(f.config.outputDir, file)).size > 0);
  });
});
test("failed receipt rollback never deletes another inode that replaced the marker", t => {
  const f = fixture(t), marker = join(f.config.outputDir, receiptName); let markerFd;
  patchFs(t, "openSync", (original, path, ...args) => { const fd = original(path, ...args); if (path === marker && (args[0] & fs.constants.O_CREAT)) markerFd = fd; return fd; });
  patchFs(t, "writeSync", (original, fd, ...args) => {
    if (fd === markerFd) {
      fs.renameSync(marker, marker + ".failed"); fs.writeFileSync(marker, SENTINEL, { mode: 0o600 }); throw new Error(SENTINEL);
    }
    return original(fd, ...args);
  });
  assert.throws(() => materialize(f.path, options), { code: "T3_MATERIALIZER_OUTPUT_FAILED" });
  assert.equal(fs.readFileSync(marker, "utf8"), SENTINEL); assert.ok(fs.existsSync(marker + ".failed"));
});
test("failed marker unlink is explicit and never reported as materialization success", t => {
  const f = fixture(t), marker = join(f.config.outputDir, receiptName); let markerFd;
  patchFs(t, "openSync", (original, path, ...args) => { const fd = original(path, ...args); if (path === marker && (args[0] & fs.constants.O_CREAT)) markerFd = fd; return fd; });
  patchFs(t, "writeSync", (original, fd, ...args) => { if (fd === markerFd) throw new Error(SENTINEL); return original(fd, ...args); });
  patchFs(t, "unlinkSync", () => { throw new Error(SENTINEL); });
  assert.throws(() => materialize(f.path, options), { code: "T3_MATERIALIZER_RECEIPT_ROLLBACK_FAILED" });
  assert.ok(fs.existsSync(marker)); assert.equal(fs.statSync(marker).size, 0);
});
test("exclusive reservation collisions preserve preexisting bytes and earlier outputs", t => {
  const f = fixture(t), collided = join(f.config.outputDir, outputs[1]); let created = false;
  patchFs(t, "openSync", (original, path, ...args) => {
    if (!created && path === collided && (args[0] & fs.constants.O_CREAT)) { created = true; fs.writeFileSync(collided, SENTINEL, { mode: 0o600 }); }
    return original(path, ...args);
  });
  reject(f, "T3_MATERIALIZER_OUTPUT_FAILED"); assert.equal(fs.readFileSync(collided, "utf8"), SENTINEL);
  assert.equal(fs.statSync(join(f.config.outputDir, outputs[0])).size, 0);
});
test("output modification after its own readback is detected before receipt creation", t => {
  const f = fixture(t); let writes = 0;
  patchFs(t, "writeSync", (original, ...args) => {
    const result = original(...args);
    if (++writes === 2) fs.appendFileSync(join(f.config.outputDir, outputs[0]), " ");
    return result;
  });
  reject(f, "T3_MATERIALIZER_OUTPUT_READBACK_FAILED");
});
test("the authenticated readback snapshot cannot be replaced by a later modified baseline", t => {
  const f = fixture(t), path = join(f.config.outputDir, outputs[0]); let reads = 0;
  patchFs(t, "lstatSync", (original, target, ...args) => {
    const stat = original(target, ...args);
    // readPrivate's final path check sees the original file; the mutation lands
    // immediately after that observation, before the caller stores its baseline.
    if (target === path && ++reads === 2) fs.appendFileSync(path, " ");
    return stat;
  });
  reject(f, "T3_MATERIALIZER_OUTPUT_READBACK_FAILED");
  assert.ok(reads >= 2);
  assert.deepEqual(fs.readdirSync(f.config.outputDir).sort(), [...outputs].sort());
});

function cliRepository(t) {
  const path = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "hr-t3-cli-code-test-")));
  t.after(() => fs.rmSync(path, { recursive: true, force: true }));
  const pending = [CLI], copied = new Set();
  while (pending.length) {
    const relative = pending.pop(); if (copied.has(relative)) continue; copied.add(relative);
    const original = join(ROOT, relative), destination = join(path, relative), content = fs.readFileSync(original, "utf8");
    fs.mkdirSync(dirname(destination), { recursive: true }); fs.copyFileSync(original, destination);
    for (const match of content.matchAll(/from\s+["'](\.[^"']+)["']/gu)) pending.push(resolve(ROOT, dirname(relative), match[1]).slice(ROOT.length + 1));
  }
  for (const name of ["production-import-target-model-v1.json", "production-import-execution-v2.json"]) {
    const relative = `scripts/hr-cutover/contracts/${name}`, destination = join(path, relative);
    fs.mkdirSync(dirname(destination), { recursive: true }); fs.copyFileSync(join(ROOT, relative), destination);
  }
  const git = args => {
    const result = spawnSync("git", args, { cwd: path, encoding: "utf8", timeout: 15000 }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  git(["init", "-q"]); git(["add", "."]); git(["-c", "user.name=Synthetic Test", "-c", "user.email=synthetic@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Synthetic CLI code fixture"]);
  return { path, head: git(["rev-parse", "HEAD"]) };
}
test("actual CLI succeeds against a clean synthetic code repository, redacts errors, and refuses dirty code or overrides", t => {
  const repository = cliRepository(t), f = fixture(t, { head: repository.head, legacy: true });
  const cli = args => spawnSync(process.execPath, [join(repository.path, CLI), ...args], { cwd: repository.path, encoding: "utf8", timeout: 20000 });
  const success = cli(["--config", f.path]); assert.equal(success.status, 0, success.stderr); assert.equal(success.stderr, "");
  assert.equal(JSON.parse(success.stdout).recordCount, 21); assert.equal(JSON.parse(success.stdout).productionImport, "HOLD");
  const rejected = cli(["--config", f.path]); assert.equal(rejected.status, 1); assert.equal(rejected.stderr.trim(), "T3_MATERIALIZER_OUTPUT_NOT_EMPTY");
  const override = cli(["--config", f.path, "--current-head", repository.head]); assert.equal(override.stderr.trim(), "T3_MATERIALIZER_ARGUMENT_INVALID");
  fs.appendFileSync(join(repository.path, CLI), "\n");
  const dirty = cli(["--config", f.path]); assert.equal(dirty.stderr.trim(), "T3_MATERIALIZER_CURRENT_CODE_REQUIRED");
  for (const result of [success, rejected, override, dirty]) for (const value of [SENTINEL, f.root, repository.path, "SYN-E", "12.345"]) assert.equal((result.stdout + result.stderr).includes(value), false);
});
