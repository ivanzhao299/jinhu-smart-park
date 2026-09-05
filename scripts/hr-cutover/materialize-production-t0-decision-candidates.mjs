#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { computeProductionImportTargetScopeHash } from "./production-import-sealed-plan-lib.mjs";
import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL,
  computeProductionImportBusinessIdentityHash,
  computeProductionImportTargetCanonicalHash,
  deriveProductionImportTargetId,
} from "./production-import-target-model.mjs";
import { verifyYuzhouJobStateDecisionArtifact } from "./yuzhou-job-state-decision-artifact-lib.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const DATE = /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/u;
const PHASE = "T0";
const DOMAINS = Object.freeze([
  Object.freeze({ name: "departments", file: "departments.jsonl", sourceTable: "dbo.departmentcode", targetTable: "sys_org" }),
  Object.freeze({ name: "positions", file: "positions.jsonl", sourceTable: "dbo.job", targetTable: "hr_position" }),
  Object.freeze({ name: "employees", file: "employees.jsonl", sourceTable: "dbo.person", targetTable: "hr_employee" }),
]);

export class ProductionT0DecisionCandidatesError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionT0DecisionCandidatesError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const mode = path => statSync(path).mode & 0o777;
const canonical = value => JSON.stringify(value, Object.keys(value).sort());

function exact(value, keys, code, label) {
  if (!plain(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code, label);
}

function privateDirectory(path, label) {
  if (!isAbsolute(path) || !existsSync(path)) fail("PRODUCTION_IMPORT_T0_DECISION_PATH_INVALID", label);
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isDirectory() || mode(path) !== 0o700) fail("PRODUCTION_IMPORT_T0_DECISION_PATH_INVALID", label);
  return resolve(path);
}

function privateFile(path, label) {
  if (!isAbsolute(path) || !existsSync(path)) fail("PRODUCTION_IMPORT_T0_DECISION_INPUT_MISSING", label);
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isFile() || mode(path) !== 0o600) fail("PRODUCTION_IMPORT_T0_DECISION_PATH_INVALID", label);
  return resolve(path);
}

function readJson(path, code) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { fail(code, "JSON"); }
}

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const value = String(result.stdout ?? "").trim();
  if (result.status !== 0 || !CODE_SHA.test(value)) fail("PRODUCTION_IMPORT_T0_DECISION_CODE_INVALID", "HEAD");
  return value;
}

function validateTriple(value, head) {
  exact(value, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "PRODUCTION_IMPORT_T0_DECISION_TRIPLE_INVALID", "triple");
  if (!CODE_SHA.test(value.codeSha ?? "") || !SHA256.test(value.sourceSnapshotHash ?? "") || !SHA256.test(value.mappingContractHash ?? "") || value.codeSha !== head) {
    fail("PRODUCTION_IMPORT_T0_DECISION_TRIPLE_INVALID", "C/S/M");
  }
  return Object.freeze({ ...value });
}

function validDate(value) {
  if (!DATE.test(value ?? "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value) {
  const normalized = text(value);
  return normalized.length === 0 ? null : normalized;
}

function integerOr(value, fallback) {
  if (Number.isSafeInteger(value)) return value;
  const normalized = text(value);
  return /^-?[0-9]+$/u.test(normalized) && Number.isSafeInteger(Number(normalized)) ? Number(normalized) : fallback;
}

function optionalDate(value) {
  const normalized = text(value);
  return normalized === "" ? { value: null, valid: true } : { value: normalized, valid: validDate(normalized) };
}

export function parseLegacyPositionHeadcount(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return { value: null, valid: true };
  const numeric = typeof value === "number" ? value
    : typeof value === "string" && /^[+-]?[0-9]+$/u.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isSafeInteger(numeric) || numeric < -2147483648 || numeric > 2147483647) return { value: null, valid: false };
  return { value: numeric, valid: true };
}

function readStage(stagingDir, triple) {
  const manifest = readJson(privateFile(resolve(stagingDir, "manifest.json"), "manifest"), "PRODUCTION_IMPORT_T0_DECISION_MANIFEST_INVALID");
  if (!plain(manifest) || manifest.formatVersion !== 1 || !plain(manifest.domains)) fail("PRODUCTION_IMPORT_T0_DECISION_MANIFEST_INVALID", "manifest");
  const byTable = new Map();
  for (const domain of DOMAINS) {
    const item = manifest.domains[domain.name];
    exact(item, ["rows", "file", "fileSha256"], "PRODUCTION_IMPORT_T0_DECISION_MANIFEST_INVALID", domain.name);
    if (!Number.isSafeInteger(item.rows) || item.rows < 1 || item.file !== domain.file || !SHA256.test(item.fileSha256 ?? "")) fail("PRODUCTION_IMPORT_T0_DECISION_MANIFEST_INVALID", domain.name);
    const path = privateFile(resolve(stagingDir, domain.file), domain.name);
    const bytes = readFileSync(path);
    if (sha256(bytes) !== item.fileSha256) fail("PRODUCTION_IMPORT_T0_DECISION_STAGING_HASH_MISMATCH", domain.name);
    const rows = bytes.toString("utf8").split("\n").filter(Boolean).map((line, index) => {
      let row;
      try { row = JSON.parse(line); } catch { fail("PRODUCTION_IMPORT_T0_DECISION_STAGING_INVALID", `${domain.name}:${index}`); }
      exact(row, ["sourceTable", "sourceKey", "sourceIdentitySha256", "sourceRowSha256", "source"], "PRODUCTION_IMPORT_T0_DECISION_STAGING_INVALID", domain.name);
      if (row.sourceTable !== domain.sourceTable || text(row.sourceKey) === "" || !SHA256.test(row.sourceIdentitySha256 ?? "") || !SHA256.test(row.sourceRowSha256 ?? "") || !plain(row.source)) fail("PRODUCTION_IMPORT_T0_DECISION_STAGING_INVALID", domain.name);
      if (row.sourceIdentitySha256 !== sha256(`${domain.sourceTable}\0${row.sourceKey}`) || row.sourceRowSha256 !== sha256(canonical(row.source))) fail("PRODUCTION_IMPORT_T0_DECISION_STAGING_INVALID", domain.name);
      return Object.freeze({ ...row, targetTable: domain.targetTable });
    });
    if (rows.length !== item.rows || new Set(rows.map(row => row.sourceIdentitySha256)).size !== rows.length) fail("PRODUCTION_IMPORT_T0_DECISION_STAGING_INVALID", domain.name);
    byTable.set(domain.targetTable, rows);
  }
  const total = [...byTable.values()].flat();
  if (new Set(total.map(row => row.sourceIdentitySha256)).size !== total.length) fail("PRODUCTION_IMPORT_T0_DECISION_STAGING_INVALID", "cross-table duplicate identity");
  if (total.length === 0) fail("PRODUCTION_IMPORT_T0_DECISION_SOURCE_COUNT_DRIFT", "T0");
  return { byTable, sourceSnapshotHash: triple.sourceSnapshotHash };
}

function readPhaseArtifact(path, triple, stage) {
  const bytes = readFileSync(privateFile(path, "phase artifact"));
  const value = readJson(path, "PRODUCTION_IMPORT_T0_DECISION_PHASE_INVALID");
  exact(value, ["formatVersion", "artifactKind", "triple", "phase", "records"], "PRODUCTION_IMPORT_T0_DECISION_PHASE_INVALID", "phase");
  if (value.formatVersion !== 1 || value.artifactKind !== "yuzhou_hr_production_import_real_phase_staging" || value.phase !== PHASE || JSON.stringify(value.triple) !== JSON.stringify(triple) || !Array.isArray(value.records)) fail("PRODUCTION_IMPORT_T0_DECISION_PHASE_INVALID", "identity");
  const expected = new Map([...stage.byTable.values()].flat().map(row => [row.sourceIdentitySha256, row]));
  if (value.records.length !== expected.size) fail("PRODUCTION_IMPORT_T0_DECISION_PHASE_INVALID", "count");
  for (const row of value.records) {
    exact(row, ["phase", "targetTable", "sourceSystem", "sourceTable", "sourcePkCanonical", "sourceIdentitySha256", "sourceRowSha256"], "PRODUCTION_IMPORT_T0_DECISION_PHASE_INVALID", "record");
    const source = expected.get(row.sourceIdentitySha256);
    if (!source || row.phase !== PHASE || row.targetTable !== source.targetTable || row.sourceSystem !== "yuzhou-v10" || row.sourceTable !== source.sourceTable || row.sourcePkCanonical !== `sha256:${source.sourceIdentitySha256}` || row.sourceRowSha256 !== source.sourceRowSha256) fail("PRODUCTION_IMPORT_T0_DECISION_PHASE_INVALID", "record binding");
    expected.delete(row.sourceIdentitySha256);
  }
  if (expected.size !== 0) fail("PRODUCTION_IMPORT_T0_DECISION_PHASE_INVALID", "coverage");
  return sha256(bytes);
}

function readScope(path, inventory) {
  const value = readJson(privateFile(path, "target scope"), "PRODUCTION_IMPORT_T0_DECISION_SCOPE_INVALID");
  exact(value, ["tenantId", "parkId"], "PRODUCTION_IMPORT_T0_DECISION_SCOPE_INVALID", "scope");
  if (text(value.tenantId) !== value.tenantId || text(value.parkId) !== value.parkId || value.tenantId.length === 0 || value.parkId.length === 0) fail("PRODUCTION_IMPORT_T0_DECISION_SCOPE_INVALID", "scope values");
  const targetScope = { tenantId: value.tenantId, parkId: value.parkId };
  targetScope.scopeSha256 = computeProductionImportTargetScopeHash(targetScope);
  if (targetScope.scopeSha256 !== inventory.targetScopeSha256) fail("PRODUCTION_IMPORT_T0_DECISION_SCOPE_INVALID", "inventory binding");
  return targetScope;
}

export function validateProductionT0DecisionInventory(value, expectedTriple) {
  const validHash = hash => typeof hash === "string" && SHA256.test(hash);
  const full = value?.kind === "yuzhou_hr_production_target_inventory_readonly";
  const keys = ["formatVersion", "kind", "status", "productionImport", "executionReachable", "targetIdentitySha256", "targetScopeSha256", "targetTableCounts", "records"];
  exact(value, [...keys, ...(full ? ["sourceManifestSha256", "triple"] : [])], "PRODUCTION_IMPORT_T0_DECISION_INVENTORY_INVALID", "inventory");
  if (value.formatVersion !== 1 || (!full && value.kind !== "yuzhou_hr_production_t0_target_inventory_readonly") || value.status !== "PASS" || value.productionImport !== "HOLD" || value.executionReachable !== false || !validHash(value.targetIdentitySha256) || !validHash(value.targetScopeSha256) || !plain(value.targetTableCounts) || !Array.isArray(value.records)) fail("PRODUCTION_IMPORT_T0_DECISION_INVENTORY_INVALID", "identity");
  if (full) {
    exact(value.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "PRODUCTION_IMPORT_T0_DECISION_INVENTORY_INVALID", "inventory triple");
    if (!validHash(value.sourceManifestSha256)
      || !expectedTriple || typeof value.triple.codeSha !== "string" || !CODE_SHA.test(value.triple.codeSha)
      || !validHash(value.triple.sourceSnapshotHash) || !validHash(value.triple.mappingContractHash)
      || Object.keys(value.triple).some(key => value.triple[key] !== expectedTriple[key])) fail("PRODUCTION_IMPORT_T0_DECISION_INVENTORY_INVALID", "inventory source/code/mapping binding");
  }
  const t0Tables = DOMAINS.map(domain => domain.targetTable);
  const tables = full ? Object.keys(DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables) : t0Tables;
  exact(value.targetTableCounts, tables, "PRODUCTION_IMPORT_T0_DECISION_INVENTORY_INVALID", "table counts");
  const expectedCounts = Object.fromEntries(tables.map(table => [table, 0]));
  const records = new Map();
  const ids = new Set();
  const identities = new Set();
  for (const row of value.records) {
    exact(row, ["targetTable", "businessIdentitySha256", "targetId", "targetCanonicalSha256", "targetVersion"], "PRODUCTION_IMPORT_T0_DECISION_INVENTORY_INVALID", "record");
    if (!Object.hasOwn(expectedCounts, row.targetTable) || !validHash(row.businessIdentitySha256) || !validHash(row.targetCanonicalSha256) || typeof row.targetId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(row.targetId) || !Number.isSafeInteger(row.targetVersion) || row.targetVersion < 0) fail("PRODUCTION_IMPORT_T0_DECISION_INVENTORY_INVALID", "record values");
    const key = `${row.targetTable}:${row.businessIdentitySha256}`;
    const id = `${row.targetTable}:${row.targetId}`;
    if (identities.has(key) || ids.has(id)) fail("PRODUCTION_IMPORT_T0_DECISION_INVENTORY_INVALID", "duplicate");
    identities.add(key); ids.add(id);
    if (t0Tables.includes(row.targetTable)) records.set(key, Object.freeze({ ...row }));
    expectedCounts[row.targetTable] += 1;
  }
  if (Object.entries(expectedCounts).some(([key, count]) => value.targetTableCounts[key] !== count)) fail("PRODUCTION_IMPORT_T0_DECISION_INVENTORY_INVALID", "counts");
  return { value, records };
}

function readInventory(path, triple) {
  const bytes = readFileSync(privateFile(path, "target inventory"));
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("PRODUCTION_IMPORT_T0_DECISION_INVENTORY_INVALID", "JSON"); }
  return { ...validateProductionT0DecisionInventory(value, triple), artifactSha256: sha256(bytes) };
}

function readJobState(path, triple) {
  const bytes = readFileSync(privateFile(path, "job state decision"));
  const value = readJson(path, "PRODUCTION_IMPORT_T0_DECISION_JOB_STATE_INVALID");
  let verified;
  try { verified = verifyYuzhouJobStateDecisionArtifact(value); }
  catch { fail("PRODUCTION_IMPORT_T0_DECISION_JOB_STATE_INVALID", "contract"); }
  if (value.formatVersion !== 2 || value.artifactStatus !== "MACHINE_CANDIDATE" || value.triple.codeSha !== triple.codeSha || value.triple.sourceSnapshotHash !== triple.sourceSnapshotHash || value.triple.mappingContractHash !== triple.mappingContractHash || verified.machineAssertion !== "PASS" || verified.observedRecordCount !== 2949) fail("PRODUCTION_IMPORT_T0_DECISION_JOB_STATE_INVALID", "binding");
  return { decisions: new Map(value.decisions.map(row => [row.sourceIdentitySha256, row])), artifactSha256: sha256(bytes) };
}

function sourceRecord(row) {
  return { phase: PHASE, targetTable: row.targetTable, sourceSystem: "yuzhou-v10", sourceTable: row.sourceTable, sourcePkCanonical: `sha256:${row.sourceIdentitySha256}`, sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256 };
}

function candidate(row, fields, dependencies, scope, inventory, disposition = "insert", reasonCode = null) {
  const result = { ...sourceRecord(row), candidateDisposition: disposition, reasonCode, targetFields: fields, dependencyRefs: dependencies, businessIdentitySha256: null, expectedTargetId: null, expectedTargetVersion: null, expectedTargetCanonicalSha256: null };
  if (fields === null) return result;
  const derived = Object.fromEntries(dependencies.map(dependency => [dependency.derivedField, dependency.targetId]));
  const businessIdentitySha256 = computeProductionImportBusinessIdentityHash(row.targetTable, scope, fields, derived);
  const canonicalSha256 = computeProductionImportTargetCanonicalHash(row.targetTable, scope, fields, derived);
  const existing = inventory.records.get(`${row.targetTable}:${businessIdentitySha256}`);
  result.businessIdentitySha256 = businessIdentitySha256;
  if (!existing) {
    result.expectedTargetId = deriveProductionImportTargetId({ targetScope: scope, targetTable: row.targetTable, sourceIdentitySha256: row.sourceIdentitySha256 });
    return result;
  }
  result.expectedTargetId = existing.targetId;
  result.expectedTargetVersion = existing.targetVersion;
  result.expectedTargetCanonicalSha256 = existing.targetCanonicalSha256;
  // Matching target bytes cannot resolve a rejected source value or blocked dependency.
  if (disposition === "quarantine") return result;
  if (existing.targetCanonicalSha256 === canonicalSha256) {
    result.candidateDisposition = "skip_exact";
    return result;
  }
  result.candidateDisposition = "review_target_collision";
  result.reasonCode = "TARGET_CANONICAL_MISMATCH";
  return result;
}

function hasBlockingDependency(dependencies) {
  return dependencies.some(dependency => !["insert", "skip_exact"].includes(dependency.candidateDisposition));
}

function link(role, source, targetTable, derivedField) {
  return { role, phase: PHASE, sourceIdentitySha256: source.sourceIdentitySha256, expectedTargetTable: targetTable, derivedField, targetId: source.expectedTargetId, candidateDisposition: source.candidateDisposition };
}

function outputDependency(value) {
  const { derivedField: _derivedField, targetId: _targetId, candidateDisposition: _candidateDisposition, ...result } = value;
  return result;
}

function buildCandidates(stage, scope, inventory, jobState) {
  const byCode = new Map();
  const organizations = [];
  const organizationRowsByCode = new Map();
  for (const row of stage.byTable.get("sys_org")) {
    const code = text(row.sourceKey);
    if (organizationRowsByCode.has(code)) fail("PRODUCTION_IMPORT_T0_DECISION_STAGING_INVALID", "organization code duplicate");
    organizationRowsByCode.set(code, row);
  }
  for (const row of [...organizationRowsByCode.values()].sort((left, right) => text(left.sourceKey).length - text(right.sourceKey).length || text(left.sourceKey).localeCompare(text(right.sourceKey)))) {
    const code = text(row.sourceKey);
    const name = text(row.source.orgName);
    const fields = name === "" ? null : { org_code: code, org_name: name, org_type: integerOr(row.source.rating, 1) <= 1 ? "company" : "department", sort_order: integerOr(row.source.sortOrder, 0), status: "enabled", remark: null };
    const parent = [...byCode.entries()].filter(([candidateCode]) => candidateCode.length < code.length && code.startsWith(candidateCode)).sort((left, right) => right[0].length - left[0].length)[0]?.[1] ?? null;
    const dependencies = parent ? [link("parent_org", parent, "sys_org", "parent_id")] : [];
    const rowCandidate = fields === null ? candidate(row, null, [], scope, inventory, "quarantine", "ORG_NAME_REQUIRED") : hasBlockingDependency(dependencies) ? candidate(row, fields, dependencies, scope, inventory, "quarantine", "DEPENDENCY_UNRESOLVED") : candidate(row, fields, dependencies, scope, inventory);
    organizations.push(rowCandidate);
    byCode.set(code, rowCandidate);
  }
  const root = byCode.get("000") ?? null;
  const positionsByCode = new Map();
  const positions = [];
  for (const row of stage.byTable.get("hr_position")) {
    const code = text(row.sourceKey);
    if (positionsByCode.has(code)) fail("PRODUCTION_IMPORT_T0_DECISION_STAGING_INVALID", "position code duplicate");
    const name = text(row.source.positionName);
    const org = byCode.get(text(row.source.departmentCode)) ?? root;
    const headcount = parseLegacyPositionHeadcount(row.source.headcountLimit);
    const fields = name === "" ? null : { position_code: code, position_name: name, job_family: nullableText(row.source.jobgrade), job_level: nullableText(row.source.salarygrade), headcount_limit: headcount.value, status: "enabled", remark: null };
    const dependencies = org ? [link("org", org, "sys_org", "org_id")] : [];
    const rowCandidate = fields === null ? candidate(row, null, [], scope, inventory, "quarantine", "POSITION_NAME_REQUIRED") : !headcount.valid ? candidate(row, null, [], scope, inventory, "quarantine", "POSITION_HEADCOUNT_INVALID") : !org ? candidate(row, null, [], scope, inventory, "quarantine", "POSITION_ORG_REQUIRED") : hasBlockingDependency(dependencies) ? candidate(row, fields, dependencies, scope, inventory, "quarantine", "DEPENDENCY_UNRESOLVED") : candidate(row, fields, dependencies, scope, inventory);
    positions.push(rowCandidate);
    positionsByCode.set(code, rowCandidate);
  }
  const employees = [];
  for (const row of stage.byTable.get("hr_employee")) {
    const org = byCode.get(text(row.source.departmentCode));
    const position = positionsByCode.get(text(row.source.positionCode)) ?? null;
    const stateIdentity = sha256(`dbo.person.jobstate\0${text(row.source.legacyStatus).toLowerCase()}`);
    const state = jobState.decisions.get(stateIdentity) ?? null;
    const hire = optionalDate(row.source.hireDate), probation = optionalDate(row.source.formalDate), departure = optionalDate(row.source.departureDate);
    const fields = text(row.source.fullName) === "" ? null : {
      employee_code: text(row.sourceKey), full_name: text(row.source.fullName), employment_type: "full_time", employment_status: state?.decision === "map" ? state.targetEmploymentStatus : null,
      hire_date: hire.value, probation_end_date: probation.value, departure_date: departure.value, work_location: null, work_mobile: null, work_email: null,
      remark: hire.valid && probation.valid && departure.valid && !(hire.value && departure.value && departure.value < hire.value) ? null : "Legacy date requires review",
    };
    const dependencies = org ? [link("primary_org", org, "sys_org", "primary_org_id"), ...(position ? [link("position", position, "hr_position", "position_id")] : [])] : [];
    let rowCandidate;
    if (fields === null) rowCandidate = candidate(row, null, [], scope, inventory, "quarantine", "EMPLOYEE_NAME_REQUIRED");
    else if (!org) rowCandidate = candidate(row, null, [], scope, inventory, "quarantine", "EMPLOYEE_ORG_REQUIRED");
    else if (!hire.valid || !probation.valid || !departure.valid) rowCandidate = candidate(row, null, [], scope, inventory, "quarantine", "EMPLOYEE_DATE_INVALID");
    else if (!state || state.decision !== "map") rowCandidate = candidate(row, null, [], scope, inventory, "quarantine", "EMPLOYEE_JOB_STATE_UNRESOLVED");
    else if (hasBlockingDependency(dependencies)) rowCandidate = candidate(row, fields, dependencies, scope, inventory, "quarantine", "DEPENDENCY_UNRESOLVED");
    else rowCandidate = candidate(row, fields, dependencies, scope, inventory);
    employees.push(rowCandidate);
  }
  return [...organizations, ...positions, ...employees].map(row => ({ ...row, dependencyRefs: row.dependencyRefs.map(outputDependency) }));
}

function writePrivateNew(path, value) {
  if (!isAbsolute(path) || basename(path) !== path.split("/").at(-1) || existsSync(path)) fail("PRODUCTION_IMPORT_T0_DECISION_OUTPUT_INVALID", "output");
  privateDirectory(dirname(path), "output parent");
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
  privateFile(path, "output");
}

/**
 * Builds a private T0 collision/decision candidate artifact. It is deliberately
 * not a production writer: collisions and quarantines stay HOLD until the
 * existing controlled resolver supplies the required attestation/before-image.
 */
export function materializeProductionT0DecisionCandidates(input, { head = currentHead } = {}) {
  const stagingDir = privateDirectory(input.stagingDir, "staging");
  const triple = validateTriple(readJson(privateFile(input.triplePath, "triple"), "PRODUCTION_IMPORT_T0_DECISION_TRIPLE_INVALID"), head());
  const stage = readStage(stagingDir, triple);
  const phaseArtifactSha256 = readPhaseArtifact(input.phaseArtifactPath, triple, stage);
  const inventory = readInventory(input.targetInventoryPath, triple);
  const targetScope = readScope(input.targetScopePath, inventory.value);
  const jobState = readJobState(input.jobStatePath, triple);
  const records = buildCandidates(stage, targetScope, inventory, jobState)
    .sort((left, right) => left.targetTable.localeCompare(right.targetTable) || left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
  const countByDisposition = Object.fromEntries(["insert", "skip_exact", "review_target_collision", "quarantine"].map(kind => [kind, records.filter(row => row.candidateDisposition === kind).length]));
  const artifact = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_production_import_real_t0_decision_candidates",
    triple,
    phaseArtifactSha256,
    targetInventoryArtifactSha256: inventory.artifactSha256,
    targetIdentitySha256: inventory.value.targetIdentitySha256,
    targetScope,
    jobStateDecisionArtifactSha256: jobState.artifactSha256,
    status: countByDisposition.review_target_collision === 0 && countByDisposition.quarantine === 0 ? "READY_FOR_FREEZE" : "REVIEW_HOLD",
    countByDisposition,
    records,
    productionImport: "HOLD",
  };
  writePrivateNew(resolve(input.outputPath), artifact);
  return Object.freeze({ status: artifact.status, phase: PHASE, recordCount: records.length, targetTableCounts: Object.freeze(Object.fromEntries(["sys_org", "hr_position", "hr_employee"].map(table => [table, records.filter(row => row.targetTable === table).length]))), countByDisposition: Object.freeze({ ...countByDisposition }), artifactSha256: sha256(Buffer.from(`${JSON.stringify(artifact)}\n`, "utf8")), productionImport: "HOLD" });
}

function parseArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  const allowed = ["--staging", "--triple", "--phase-artifact", "--target-inventory", "--target-scope", "--job-state", "--output"];
  if (input.length !== allowed.length * 2) fail("PRODUCTION_IMPORT_T0_DECISION_ARGUMENT_INVALID", "arguments");
  const values = {};
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index], value = input[index + 1];
    if (!allowed.includes(key) || !value || values[key] || !isAbsolute(value)) fail("PRODUCTION_IMPORT_T0_DECISION_ARGUMENT_INVALID", "arguments");
    values[key] = resolve(value);
  }
  return { stagingDir: values["--staging"], triplePath: values["--triple"], phaseArtifactPath: values["--phase-artifact"], targetInventoryPath: values["--target-inventory"], targetScopePath: values["--target-scope"], jobStatePath: values["--job-state"], outputPath: values["--output"] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(materializeProductionT0DecisionCandidates(parseArgs(process.argv.slice(2))))}\n`); }
  catch (error) { process.stderr.write(`${error instanceof ProductionT0DecisionCandidatesError ? error.code : "PRODUCTION_IMPORT_T0_DECISION_FAILED"}\n`); process.exitCode = 1; }
}
