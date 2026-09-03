#!/usr/bin/env node
/**
 * Builds the private, reviewable T1 employment-event candidate artifact.
 * This is deliberately not a production writer: it reads a controlled source
 * stage and hash-only receipts, then emits candidate fields only inside a
 * private directory for the existing freeze/writer chain.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { computeProductionImportBusinessIdentityHash, computeProductionImportTargetCanonicalHash, deriveProductionImportTargetId } from "./production-import-target-model.mjs";
import { computeProductionImportTargetScopeHash } from "./production-import-sealed-plan-lib.mjs";
import { verifyT1EventTypeDecision, verifyT1EventTypeStaging } from "./verify-yuzhou-t1-event-type-decision.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const LOCAL_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u;
const PHASE = "T1";
const TARGET_TABLE = "hr_employment_event";
const SOURCE_TABLE = "dbo.readjust";
const STAGE_DOMAINS = Object.freeze({ employmentEvents: "employment-events.jsonl", employmentEventTypes: "employment-event-types.json", employmentEventStates: "employment-event-states.json" });

export class ProductionT1DecisionCandidatesError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; }
}

const fail = (code, detail) => { throw new ProductionT1DecisionCandidatesError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const canonicalTopLevel = value => JSON.stringify(value, Object.keys(value).sort());
const mode = path => statSync(path).mode & 0o777;
const text = value => typeof value === "string" ? value.trim() : "";
const nullable = value => text(value) || null;

function exact(value, keys, code, label) {
  if (!plain(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code, label);
}

function privateDirectory(path, label) {
  if (!isAbsolute(path) || !existsSync(path)) fail("PRODUCTION_IMPORT_T1_DECISION_PATH_INVALID", label);
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isDirectory() || mode(path) !== 0o700) fail("PRODUCTION_IMPORT_T1_DECISION_PATH_INVALID", label);
  return resolve(path);
}

function privateFile(path, label) {
  if (!isAbsolute(path) || !existsSync(path)) fail("PRODUCTION_IMPORT_T1_DECISION_INPUT_MISSING", label);
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1 || mode(path) !== 0o600) fail("PRODUCTION_IMPORT_T1_DECISION_PATH_INVALID", label);
  return resolve(path);
}

function readJson(path, code, label) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { fail(code, label); }
}

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const value = String(result.stdout ?? "").trim();
  if (result.status !== 0 || !CODE_SHA.test(value)) fail("PRODUCTION_IMPORT_T1_DECISION_CODE_INVALID", "HEAD");
  return value;
}

function readTriple(path, head) {
  const value = readJson(privateFile(path, "triple"), "PRODUCTION_IMPORT_T1_DECISION_TRIPLE_INVALID", "JSON");
  exact(value, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "PRODUCTION_IMPORT_T1_DECISION_TRIPLE_INVALID", "C/S/M");
  if (!CODE_SHA.test(value.codeSha ?? "") || !SHA256.test(value.sourceSnapshotHash ?? "") || !SHA256.test(value.mappingContractHash ?? "") || value.codeSha !== head) fail("PRODUCTION_IMPORT_T1_DECISION_TRIPLE_INVALID", "C/S/M");
  return Object.freeze({ ...value });
}

function readStage(stagingDir, triple) {
  const manifestPath = privateFile(resolve(stagingDir, "manifest.json"), "manifest");
  const manifest = readJson(manifestPath, "PRODUCTION_IMPORT_T1_DECISION_STAGE_INVALID", "manifest");
  if (manifest.formatVersion !== 1 || !plain(manifest.domains) || JSON.stringify(Object.keys(manifest.domains).sort()) !== JSON.stringify(Object.keys(STAGE_DOMAINS).sort())) fail("PRODUCTION_IMPORT_T1_DECISION_STAGE_INVALID", "manifest");
  const files = {};
  for (const [domain, file] of Object.entries(STAGE_DOMAINS)) {
    const item = manifest.domains[domain];
    exact(item, ["rows", "file", "fileSha256"], "PRODUCTION_IMPORT_T1_DECISION_STAGE_INVALID", domain);
    if (!Number.isSafeInteger(item.rows) || item.rows < 0 || item.file !== file || !SHA256.test(item.fileSha256 ?? "")) fail("PRODUCTION_IMPORT_T1_DECISION_STAGE_INVALID", domain);
    const path = privateFile(resolve(stagingDir, file), domain), bytes = readFileSync(path);
    if (sha256(bytes) !== item.fileSha256) fail("PRODUCTION_IMPORT_T1_DECISION_STAGE_DRIFT", domain);
    files[domain] = { rows: item.rows, bytes };
  }
  const events = files.employmentEvents.bytes.toString("utf8").split("\n").filter(Boolean).map((line, index) => {
    let row;
    try { row = JSON.parse(line); } catch { fail("PRODUCTION_IMPORT_T1_DECISION_STAGE_INVALID", `employmentEvents:${index}`); }
    exact(row, ["sourceTable", "sourceKey", "sourceIdentitySha256", "sourceRowSha256", "source"], "PRODUCTION_IMPORT_T1_DECISION_STAGE_INVALID", "event");
    if (row.sourceTable !== SOURCE_TABLE || text(row.sourceKey) === "" || !SHA256.test(row.sourceIdentitySha256 ?? "") || !SHA256.test(row.sourceRowSha256 ?? "") || !plain(row.source) || row.sourceIdentitySha256 !== sha256(`${SOURCE_TABLE}\0${row.sourceKey}`) || row.sourceRowSha256 !== sha256(canonicalTopLevel(row.source))) fail("PRODUCTION_IMPORT_T1_DECISION_STAGE_INVALID", "event");
    return Object.freeze({ ...row });
  });
  if (events.length !== files.employmentEvents.rows || new Set(events.map(row => row.sourceIdentitySha256)).size !== events.length || events.length === 0) fail("PRODUCTION_IMPORT_T1_DECISION_STAGE_INVALID", "event coverage");
  let types, states;
  try { types = JSON.parse(files.employmentEventTypes.bytes.toString("utf8")); states = JSON.parse(files.employmentEventStates.bytes.toString("utf8")); }
  catch { fail("PRODUCTION_IMPORT_T1_DECISION_STAGE_INVALID", "dictionary JSON"); }
  if (!Array.isArray(types) || !Array.isArray(states) || types.length !== files.employmentEventTypes.rows || states.length !== files.employmentEventStates.rows) fail("PRODUCTION_IMPORT_T1_DECISION_STAGE_INVALID", "dictionary coverage");
  return { events, types, states, stageManifestSha256: sha256(readFileSync(manifestPath)), sourceSnapshotHash: triple.sourceSnapshotHash };
}

function readPhaseArtifact(path, triple, stage) {
  const file = privateFile(path, "phase artifact"), bytes = readFileSync(file), value = readJson(file, "PRODUCTION_IMPORT_T1_DECISION_PHASE_INVALID", "JSON");
  exact(value, ["formatVersion", "artifactKind", "triple", "phase", "records"], "PRODUCTION_IMPORT_T1_DECISION_PHASE_INVALID", "phase");
  if (value.formatVersion !== 1 || value.artifactKind !== "yuzhou_hr_production_import_real_phase_staging" || value.phase !== PHASE || JSON.stringify(value.triple) !== JSON.stringify(triple) || !Array.isArray(value.records) || value.records.length !== stage.events.length) fail("PRODUCTION_IMPORT_T1_DECISION_PHASE_INVALID", "identity");
  const expected = new Map(stage.events.map(row => [row.sourceIdentitySha256, row]));
  for (const row of value.records) {
    exact(row, ["phase", "targetTable", "sourceSystem", "sourceTable", "sourcePkCanonical", "sourceIdentitySha256", "sourceRowSha256"], "PRODUCTION_IMPORT_T1_DECISION_PHASE_INVALID", "record");
    const source = expected.get(row.sourceIdentitySha256);
    if (!source || row.phase !== PHASE || row.targetTable !== TARGET_TABLE || row.sourceSystem !== "yuzhou-v10" || row.sourceTable !== SOURCE_TABLE || row.sourcePkCanonical !== `sha256:${source.sourceIdentitySha256}` || row.sourceRowSha256 !== source.sourceRowSha256) fail("PRODUCTION_IMPORT_T1_DECISION_PHASE_INVALID", "record binding");
    expected.delete(row.sourceIdentitySha256);
  }
  if (expected.size !== 0) fail("PRODUCTION_IMPORT_T1_DECISION_PHASE_INVALID", "coverage");
  return sha256(bytes);
}

function readT0Candidates(path, triple) {
  const file = privateFile(path, "T0 candidates"), bytes = readFileSync(file), value = readJson(file, "PRODUCTION_IMPORT_T1_DECISION_T0_INVALID", "JSON");
  const keys = ["formatVersion", "artifactKind", "triple", "phaseArtifactSha256", "targetInventoryArtifactSha256", "targetIdentitySha256", "targetScope", "jobStateDecisionArtifactSha256", "status", "countByDisposition", "records", "productionImport"];
  exact(value, keys, "PRODUCTION_IMPORT_T1_DECISION_T0_INVALID", "artifact");
  if (value.formatVersion !== 1 || value.artifactKind !== "yuzhou_hr_production_import_real_t0_decision_candidates" || JSON.stringify(value.triple) !== JSON.stringify(triple) || !SHA256.test(value.targetIdentitySha256 ?? "") || value.productionImport !== "HOLD" || !plain(value.targetScope) || !Array.isArray(value.records)) fail("PRODUCTION_IMPORT_T1_DECISION_T0_INVALID", "identity");
  const scope = { tenantId: value.targetScope.tenantId, parkId: value.targetScope.parkId, scopeSha256: value.targetScope.scopeSha256 };
  if (typeof scope.tenantId !== "string" || typeof scope.parkId !== "string" || !SHA256.test(scope.scopeSha256 ?? "") || scope.scopeSha256 !== computeProductionImportTargetScopeHash(scope)) fail("PRODUCTION_IMPORT_T1_DECISION_T0_INVALID", "scope");
  const employees = new Map();
  for (const row of value.records) {
    if (!plain(row) || row.targetTable !== "hr_employee") continue;
    if (row.phase !== "T0" || row.sourceSystem !== "yuzhou-v10" || row.sourceTable !== "dbo.person" || !SHA256.test(row.sourceIdentitySha256 ?? "") || !UUID.test(row.expectedTargetId ?? "") || !["insert", "skip_exact"].includes(row.candidateDisposition)) continue;
    if (employees.has(row.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_T1_DECISION_T0_INVALID", "employee duplicate");
    employees.set(row.sourceIdentitySha256, Object.freeze({ targetId: row.expectedTargetId, disposition: row.candidateDisposition }));
  }
  if (employees.size === 0) fail("PRODUCTION_IMPORT_T1_DECISION_T0_INVALID", "employees");
  return { employees, targetScope: scope, targetIdentitySha256: value.targetIdentitySha256, artifactSha256: sha256(bytes) };
}

function readTypeDecision(path, triple, stage) {
  const file = privateFile(path, "event type decision"), value = readJson(file, "PRODUCTION_IMPORT_T1_DECISION_TYPE_INVALID", "JSON");
  let verified;
  try { verified = verifyT1EventTypeStaging(value, stage.types); } catch { fail("PRODUCTION_IMPORT_T1_DECISION_TYPE_INVALID", "contract"); }
  if (verified.sourceSnapshotSha256 !== triple.sourceSnapshotHash || verified.sourceRecordCount !== stage.events.length) fail("PRODUCTION_IMPORT_T1_DECISION_TYPE_INVALID", "binding");
  return { mappings: new Map(value.decisions.map(row => [text(row.sourceValue).toLowerCase(), row])), artifactSha256: sha256(readFileSync(file)) };
}

function readStateDecision(path, triple, stage) {
  const file = privateFile(path, "event state decision"), value = readJson(file, "PRODUCTION_IMPORT_T1_DECISION_STATE_INVALID", "JSON");
  exact(value, ["formatVersion", "kind", "triple", "trustedRootSha256", "machineActor", "evidence", "dictionaries", "productionImport"], "PRODUCTION_IMPORT_T1_DECISION_STATE_INVALID", "artifact");
  if (value.formatVersion !== 1 || value.kind !== "yuzhou_core_non_t0_machine_dictionary_package" || JSON.stringify(value.triple) !== JSON.stringify(triple) || !SHA256.test(value.trustedRootSha256 ?? "") || !plain(value.evidence) || !Array.isArray(value.dictionaries) || value.productionImport !== "HOLD") fail("PRODUCTION_IMPORT_T1_DECISION_STATE_INVALID", "identity");
  const dictionary = value.dictionaries.find(item => item?.dictionaryCode === "employment_event_state");
  if (!plain(dictionary) || dictionary.sourceTable !== SOURCE_TABLE || !SHA256.test(dictionary.sourceSnapshotSha256 ?? "") || !Array.isArray(dictionary.items) || dictionary.items.length !== stage.states.length) fail("PRODUCTION_IMPORT_T1_DECISION_STATE_INVALID", "dictionary");
  const expected = new Map();
  for (const row of stage.states) {
    if (!plain(row) || text(row.sourceValue) === "" || !Number.isSafeInteger(row.usageCount) || row.usageCount < 1 || expected.has(text(row.sourceValue).toLowerCase())) fail("PRODUCTION_IMPORT_T1_DECISION_STATE_INVALID", "stage");
    expected.set(text(row.sourceValue).toLowerCase(), row.usageCount);
  }
  const mappings = new Map();
  let usage = 0;
  for (const row of dictionary.items) {
    exact(row, ["id", "sourceCode", "sourceName", "sourceValue", "sourceIdentitySha256", "sourceRowSha256", "decision", "targetDomain", "targetValue", "reasonCode"], "PRODUCTION_IMPORT_T1_DECISION_STATE_INVALID", "decision");
    const key = text(row.sourceValue).toLowerCase();
    if (!key || !expected.has(key) || mappings.has(key) || row.sourceIdentitySha256 !== sha256(`dbo.readjust.state\0${text(row.sourceValue)}`) || !["map", "reject"].includes(row.decision) || (row.decision === "map" && (row.targetDomain !== "migration_decision" || typeof row.targetValue !== "string")) || (row.decision === "reject" && (row.targetDomain !== null || row.targetValue !== null))) fail("PRODUCTION_IMPORT_T1_DECISION_STATE_INVALID", "decision binding");
    mappings.set(key, row); usage += expected.get(key);
  }
  if (mappings.size !== expected.size || usage !== stage.events.length) fail("PRODUCTION_IMPORT_T1_DECISION_STATE_INVALID", "coverage");
  return { mappings, artifactSha256: sha256(readFileSync(file)) };
}

function readSnapshot(path, t0) {
  const file = privateFile(path, "target snapshot"), value = readJson(file, "PRODUCTION_IMPORT_T1_DECISION_SNAPSHOT_INVALID", "JSON");
  exact(value, ["formatVersion", "kind", "status", "productionImport", "executionReachable", "targetIdentitySha256", "targetScopeSha256", "sourceIdentityBinding", "phases", "reasonCodes"], "PRODUCTION_IMPORT_T1_DECISION_SNAPSHOT_INVALID", "snapshot");
  if (value.formatVersion !== 1 || value.kind !== "yuzhou_hr_production_preimport_snapshot_readonly" || value.status !== "HOLD" || value.productionImport !== "HOLD" || value.executionReachable !== false || value.targetIdentitySha256 !== t0.targetIdentitySha256 || value.targetScopeSha256 !== t0.targetScope.scopeSha256 || !plain(value.phases) || !plain(value.phases.T1)) fail("PRODUCTION_IMPORT_T1_DECISION_SNAPSHOT_INVALID", "identity");
  const phase = value.phases.T1;
  if (!plain(phase.beforeImageCandidate) || !plain(phase.activeRecordMapCandidate) || phase.beforeImageCandidate.rowCount !== 0 || phase.activeRecordMapCandidate.rowCount !== 0) fail("PRODUCTION_IMPORT_T1_DECISION_TARGET_INVENTORY_REQUIRED", "T1 is not empty");
  return { artifactSha256: sha256(readFileSync(file)), targetIdentitySha256: value.targetIdentitySha256 };
}

function normalizedTimestamp(value) {
  const raw = text(value), match = raw.match(LOCAL_TIMESTAMP);
  if (match) return `${match[1]}T${match[2]}${match[3] ? `.${match[3]}` : ""}+08:00`;
  if (ISO_TIMESTAMP.test(raw) && Number.isFinite(Date.parse(raw))) return raw;
  return null;
}

function sourceRecord(row) {
  return { phase: PHASE, targetTable: TARGET_TABLE, sourceSystem: "yuzhou-v10", sourceTable: SOURCE_TABLE, sourcePkCanonical: `sha256:${row.sourceIdentitySha256}`, sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256 };
}

function candidate(row, t0, typeDecision, stateDecision) {
  const employeeIdentity = sha256(`dbo.person\0${text(row.source.employeeCode)}`), employee = t0.employees.get(employeeIdentity);
  const type = typeDecision.mappings.get(text(row.source.legacyEventType).toLowerCase()), state = stateDecision.mappings.get(text(row.source.legacyState).toLowerCase());
  const sourceEffectiveAt = normalizedTimestamp(row.source.sourceEffectiveAt), effectiveDate = sourceEffectiveAt?.slice(0, 10) ?? null;
  const eventNo = text(row.source.legacyEventNo);
  const fields = eventNo && sourceEffectiveAt && type?.decision === "map" && state?.decision === "map" ? {
    event_no: eventNo, event_type: type.targetValue, effective_date: effectiveDate,
    before_snapshot: Object.fromEntries([["orgCode", nullable(row.source.beforeOrgCode)], ["positionCode", nullable(row.source.beforePositionCode)], ["employeeState", nullable(row.source.legacyEmployeeState)]].filter(([, value]) => value !== null)),
    after_snapshot: Object.fromEntries([["orgCode", nullable(row.source.afterOrgCode)], ["positionCode", nullable(row.source.afterPositionCode)], ["employeeState", nullable(row.source.legacyEmployeeState)]].filter(([, value]) => value !== null)),
    reason: nullable(row.source.reason), status: "effective", legacy_event_no: eventNo, legacy_event_type: text(row.source.legacyEventType), legacy_state: nullable(row.source.legacyState), source_effective_at: sourceEffectiveAt,
    migration_decision: state.targetValue, is_historical_import: true, remark: null,
  } : null;
  let candidateDisposition = "insert", reasonCode = null;
  if (!employee) { candidateDisposition = "quarantine"; reasonCode = "EMPLOYMENT_EVENT_EMPLOYEE_NOT_MAPPED"; }
  else if (!type || type.decision !== "map") { candidateDisposition = "quarantine"; reasonCode = "EMPLOYMENT_EVENT_TYPE_UNRESOLVED"; }
  else if (!state || state.decision !== "map" || state.targetValue !== "accepted") { candidateDisposition = "quarantine"; reasonCode = "EMPLOYMENT_EVENT_STATE_UNRESOLVED"; }
  else if (!eventNo || !sourceEffectiveAt) { candidateDisposition = "quarantine"; reasonCode = "EMPLOYMENT_EVENT_TIMESTAMP_INVALID"; }
  const dependencyRefs = employee ? [{ role: "employee", phase: "T0", sourceIdentitySha256: employeeIdentity, expectedTargetTable: "hr_employee", candidateDisposition: employee.disposition }] : [];
  const result = { ...sourceRecord(row), candidateDisposition, reasonCode, targetFields: candidateDisposition === "insert" ? fields : null, dependencyRefs, businessIdentitySha256: null, expectedTargetId: null, expectedTargetVersion: null, expectedTargetCanonicalSha256: null };
  if (candidateDisposition !== "insert") return result;
  const derived = { employee_id: employee.targetId };
  result.businessIdentitySha256 = computeProductionImportBusinessIdentityHash(TARGET_TABLE, t0.targetScope, fields, derived);
  result.expectedTargetId = deriveProductionImportTargetId({ targetScope: t0.targetScope, targetTable: TARGET_TABLE, sourceIdentitySha256: row.sourceIdentitySha256 });
  result.expectedTargetCanonicalSha256 = computeProductionImportTargetCanonicalHash(TARGET_TABLE, t0.targetScope, fields, derived);
  return result;
}

function writePrivateNew(path, value) {
  if (!isAbsolute(path) || basename(path) !== path.split("/").at(-1) || existsSync(path)) fail("PRODUCTION_IMPORT_T1_DECISION_OUTPUT_INVALID", "output");
  privateDirectory(dirname(path), "output parent");
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 }); chmodSync(path, 0o600); privateFile(path, "output");
}

/** Produces a private candidate list and never connects to PostgreSQL or writes production data. */
export function materializeProductionT1DecisionCandidates(input, { head = currentHead } = {}) {
  const triple = readTriple(input.triplePath, head());
  const stage = readStage(privateDirectory(input.stagingDir, "staging"), triple);
  const phaseArtifactSha256 = readPhaseArtifact(input.phaseArtifactPath, triple, stage);
  const t0 = readT0Candidates(input.t0CandidatesPath, triple);
  const types = readTypeDecision(input.typeDecisionPath, triple, stage);
  const states = readStateDecision(input.stateDecisionPath, triple, stage);
  const snapshot = readSnapshot(input.targetSnapshotPath, t0);
  const records = stage.events.map(row => candidate(row, t0, types, states)).sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
  const countByDisposition = Object.fromEntries(["insert", "skip_exact", "review_target_collision", "quarantine"].map(kind => [kind, records.filter(row => row.candidateDisposition === kind).length]));
  const artifact = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_t1_decision_candidates", triple, phaseArtifactSha256, t0DecisionCandidatesArtifactSha256: t0.artifactSha256, targetSnapshotArtifactSha256: snapshot.artifactSha256, targetIdentitySha256: snapshot.targetIdentitySha256, targetScope: t0.targetScope, eventTypeDecisionArtifactSha256: types.artifactSha256, eventStateDecisionArtifactSha256: states.artifactSha256, status: countByDisposition.quarantine === 0 ? "READY_FOR_FREEZE" : "REVIEW_HOLD", countByDisposition, records, productionImport: "HOLD" };
  writePrivateNew(resolve(input.outputPath), artifact);
  return Object.freeze({ status: artifact.status, phase: PHASE, recordCount: records.length, targetTableCounts: { [TARGET_TABLE]: records.length }, countByDisposition: Object.freeze({ ...countByDisposition }), artifactSha256: sha256(Buffer.from(`${JSON.stringify(artifact)}\n`, "utf8")), productionImport: "HOLD" });
}

function parseArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  const allowed = ["--staging", "--triple", "--phase-artifact", "--t0-candidates", "--type-decision", "--state-decision", "--target-snapshot", "--output"];
  if (input.length !== allowed.length * 2) fail("PRODUCTION_IMPORT_T1_DECISION_ARGUMENT_INVALID", "arguments");
  const values = {};
  for (let index = 0; index < input.length; index += 2) { const key = input[index], value = input[index + 1]; if (!allowed.includes(key) || !value || values[key] || !isAbsolute(value)) fail("PRODUCTION_IMPORT_T1_DECISION_ARGUMENT_INVALID", "arguments"); values[key] = resolve(value); }
  return { stagingDir: values["--staging"], triplePath: values["--triple"], phaseArtifactPath: values["--phase-artifact"], t0CandidatesPath: values["--t0-candidates"], typeDecisionPath: values["--type-decision"], stateDecisionPath: values["--state-decision"], targetSnapshotPath: values["--target-snapshot"], outputPath: values["--output"] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(materializeProductionT1DecisionCandidates(parseArgs(process.argv.slice(2))))}\n`); }
  catch (error) { process.stderr.write(`${error instanceof ProductionT1DecisionCandidatesError ? error.code : "PRODUCTION_IMPORT_T1_DECISION_FAILED"}\n`); process.exitCode = 1; }
}
