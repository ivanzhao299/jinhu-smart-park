#!/usr/bin/env node
/* global process, URL */
/**
 * Offline bridge from the attested T2 contract staging shape to the bounded
 * Yuzhou incremental-import API package.  It deliberately has no database or
 * network adapter: the API owns preview/commit and its transactional ledger.
 */
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { projectProductionT2Fields, verifyProductionT2StagedRecord } from "./production-t2-field-projection.mjs";

const RECIPE_VERSION = "yuzhou-reusable-incremental-contract-v1";
const SOURCE_SYSTEM = "yuzhou-v10";
const SHA256 = /^[a-f0-9]{64}$/u;
const DOMAIN_ORDER = Object.freeze({ employee: 0, profile: 1, contract: 2 });
const sha256 = value => createHash("sha256").update(value).digest("hex");
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const fail = code => { throw new Error(code); };
const privateMode = path => (statSync(path).mode & 0o777) === 0o600;
const privateDirectory = path => (statSync(path).mode & 0o777) === 0o700;

export const YUZHOU_REUSABLE_INCREMENTAL_COVERAGE = Object.freeze({
  supported: [{ domain: "contract", sourceTable: "dbo.compact", adapter: "production-t2-field-projection", dependency: "existing dbo.person source identity and immutable contract-type binding", eligibility: "only explicitly mapped draft source status" }],
  pending: [
    { domain: "employee", reason: "build-core-t0-machine-package only materializes the job-state dictionary and requires its DB digest probe; it does not expose authenticated dbo.person rows or the reviewed employee field projection needed by API employee items" },
    { domain: "profile", reason: "t5-nonfile-field-projection materializes protected profile values using its rehearsal key and has no row identity/hash envelope; API must receive raw protected fields for its own encryption, so its output cannot be replayed as an incremental DTO without a dedicated source-bound bridge" },
    { domain: "contract_type", reason: "API incremental contract DTO has no contract-type creation adapter" },
    { domain: "contract_change", reason: "API incremental contract DTO has no change-history adapter" },
    { domain: "contract_legacy_evidence", reason: "protected attachment/content binding remains a normal file-adapter follow-up" },
    { domain: "attendance_insurance_payroll_training_reward_performance", reason: "outside the first reusable contract adapter; no record is discarded by this tool" },
  ],
});

function readJson(path, code) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !statSync(path).isFile()) fail(code);
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { fail(code); }
}
function requireIso(value, code) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) || !Number.isFinite(Date.parse(value))) fail(code);
  return value;
}
function recipeSha256() {
  // Bind the actual verified projector bytes, not merely a local field list.
  // An unchanged source can therefore reuse the recipe, while mapper drift is
  // visible before package construction rather than silently changing output.
  return sha256(canonical({ recipeVersion: RECIPE_VERSION, sourceSystem: SOURCE_SYSTEM, projectorSha256: sha256(readFileSync(fileURLToPath(new URL("./production-t2-field-projection.mjs", import.meta.url)))), fields: ["employeeSourceKey", "employeeSourceTable", "contractNo", "startDate", "endDate", "probationEndDate", "workType", "positionTitle", "contractStatus"] }));
}
export const YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 = recipeSha256();
function verifyInput(input) {
  if (!plain(input) || input.recipeVersion !== RECIPE_VERSION || input.recipeSha256 !== YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 || input.sourceSystem !== SOURCE_SYSTEM || !Array.isArray(input.records) || !Array.isArray(input.employeeIndex) || !plain(input.contractStateResolutions) || !plain(input.contractTypeMappingArtifact)) fail("YUZHOU_REUSABLE_INCREMENTAL_INPUT_INVALID");
  requireIso(input.extractedAt, "YUZHOU_REUSABLE_INCREMENTAL_EXTRACTED_AT_INVALID");
  const employees = new Map();
  for (const entry of input.employeeIndex) {
    if (!plain(entry) || typeof entry.employeeCode !== "string" || !entry.employeeCode.trim() || entry.sourceTable !== "dbo.person" || typeof entry.sourceKey !== "string" || !entry.sourceKey.trim()) fail("YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_INDEX_INVALID");
    const code = entry.employeeCode.trim(), identity = sha256(`${entry.sourceTable}\0${entry.sourceKey}`);
    if (employees.has(code)) fail("YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_AMBIGUOUS");
    employees.set(code, { sourceTable: entry.sourceTable, sourceKey: `sha256:${identity}` });
  }
  const states = new Map();
  for (const [legacyState, declaration] of Object.entries(input.contractStateResolutions)) {
    if (typeof legacyState !== "string" || !legacyState.trim() || !plain(declaration) || !["draft", "active", "expired", "terminated", "cancelled"].includes(declaration.normalizedStatus) || typeof declaration.mappingEvidence !== "string" || !declaration.mappingEvidence.trim()) fail("YUZHOU_REUSABLE_INCREMENTAL_STATE_RESOLUTION_INVALID");
    states.set(legacyState.trim(), Object.freeze({ normalizedStatus: declaration.normalizedStatus, mappingEvidence: declaration.mappingEvidence }));
  }
  const artifact = input.contractTypeMappingArtifact;
  if (artifact.formatVersion !== 1 || artifact.sourceSystem !== SOURCE_SYSTEM || !plain(artifact.targetScope) || typeof artifact.targetScope.tenantId !== "string" || typeof artifact.targetScope.parkId !== "string" || !Array.isArray(artifact.bindings) || !SHA256.test(artifact.artifactSha256 ?? "")) fail("YUZHOU_REUSABLE_INCREMENTAL_TYPE_ARTIFACT_INVALID");
  const expectedArtifact = sha256(canonical({ formatVersion: artifact.formatVersion, sourceSystem: artifact.sourceSystem, targetScope: artifact.targetScope, bindings: artifact.bindings }));
  if (artifact.artifactSha256 !== expectedArtifact) fail("YUZHOU_REUSABLE_INCREMENTAL_TYPE_ARTIFACT_DRIFT");
  const types = new Map();
  for (const binding of artifact.bindings) {
    if (!plain(binding) || binding.sourceTable !== "dbo.compacttypecode" || typeof binding.sourceKey !== "string" || !binding.sourceKey.trim() || binding.sourceIdentitySha256 !== sha256(`${binding.sourceTable}\0${binding.sourceKey}`) || binding.sourcePkCanonical !== `sha256:${binding.sourceIdentitySha256}` || typeof binding.sourceTypeName !== "string" || !binding.sourceTypeName.trim() || typeof binding.sourceTypeCode !== "string" || !binding.sourceTypeCode.trim() || binding.targetTable !== "hr_contract_type" || typeof binding.targetContractTypeId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(binding.targetContractTypeId) || !["loaded", "verified"].includes(binding.mappingStatus) || !SHA256.test(binding.mappingEvidenceSha256 ?? "")) fail("YUZHOU_REUSABLE_INCREMENTAL_TYPE_BINDING_INVALID");
    const key = binding.sourceTypeName.trim(); if (types.has(key)) fail("YUZHOU_REUSABLE_INCREMENTAL_TYPE_AMBIGUOUS");
    types.set(key, Object.freeze({ ...binding }));
  }
  return { employees, states, types, typeArtifact: artifact };
}
function contractFieldCoverage(projectedFields) {
  const apiFields = new Set(["employeeSourceKey", "employeeSourceTable", "contractTypeId", "contractNo", "startDate", "endDate", "probationEndDate", "workType", "positionTitle", "contractStatus"]);
  return Object.entries(projectedFields).map(([field, value]) => ({ field, valuePresent: value !== null, disposition: apiFields.has(field) ? "carried" : "pending_api_adapter" }));
}
function itemForContract(row, employees, states, types) {
  verifyProductionT2StagedRecord(row);
  if (row.sourceTable !== "dbo.compact") fail("YUZHOU_REUSABLE_INCREMENTAL_SOURCE_UNSUPPORTED");
  const status = states.get(String(row.source.legacyState ?? "").trim());
  if (!status) fail("YUZHOU_REUSABLE_INCREMENTAL_STATE_UNRESOLVED");
  const employee = employees.get(String(row.source.employeeCode ?? "").trim());
  if (!employee) fail("YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_MISSING");
  const type = types.get(String(row.source.typeName ?? "").trim());
  if (!type) fail("YUZHOU_REUSABLE_INCREMENTAL_TYPE_MISSING");
  const projected = projectProductionT2Fields(row, { status: status.normalizedStatus }).find(value => value.targetTable === "hr_contract");
  if (!projected) fail("YUZHOU_REUSABLE_INCREMENTAL_CONTRACT_PROJECTION_MISSING");
  const f = projected.targetFields;
  const declaration = { sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256, sourceLegacyState: row.source.legacyState, normalizedStatus: status.normalizedStatus, stateMappingEvidence: status.mappingEvidence, contractType: { sourcePkCanonical: type.sourcePkCanonical, sourceIdentitySha256: type.sourceIdentitySha256, sourceTypeCode: type.sourceTypeCode, sourceTypeName: type.sourceTypeName, targetContractTypeId: type.targetContractTypeId, mappingEvidenceSha256: type.mappingEvidenceSha256 } };
  const sourceEvidence = { sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256, projectedFields: f, fieldCoverage: contractFieldCoverage({ employeeSourceKey: employee.sourceKey, employeeSourceTable: employee.sourceTable, contractTypeId: type.targetContractTypeId, contractNo: f.contract_no, startDate: f.start_date, endDate: f.end_date, probationEndDate: f.probation_end_date, workType: f.work_type, positionTitle: f.position_title, contractStatus: status.normalizedStatus, ...f }) };
  const fields = {
    employeeSourceKey: employee.sourceKey,
    employeeSourceTable: employee.sourceTable,
    contractTypeId: type.targetContractTypeId,
    contractNo: f.contract_no,
    startDate: f.start_date,
    endDate: f.end_date,
    probationEndDate: f.probation_end_date,
    workType: f.work_type,
    positionTitle: f.position_title,
    contractStatus: status.normalizedStatus,
  };
  for (const key of Object.keys(fields)) if (fields[key] === null) delete fields[key];
  const item = { domain: "contract", sourceTable: row.sourceTable, sourceKey: `sha256:${row.sourceIdentitySha256}`, rowDigest: "", fields };
  item.rowDigest = sha256(canonical({ domain: item.domain, sourceTable: item.sourceTable, sourceKey: item.sourceKey, sourceUpdatedAt: null, fields: item.fields }));
  return { item, declaration: { ...declaration, disposition: "api_eligible" }, sourceEvidence };
}
function writePrivate(path, value) {
  if (existsSync(path)) fail("YUZHOU_REUSABLE_INCREMENTAL_OUTPUT_EXISTS");
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
}

/** Builds an API DTO package and receipts only; never opens a database/socket. */
export function buildYuzhouReusableIncrementalPackage(input) {
  const { employees, states, types, typeArtifact } = verifyInput(input);
  const seen = new Set();
  const adapted = input.records.map(row => itemForContract(row, employees, states, types));
  const items = adapted.flatMap(value => value.item ? [value.item] : []).sort((left, right) => DOMAIN_ORDER[left.domain] - DOMAIN_ORDER[right.domain] || `${left.sourceTable}\0${left.sourceKey}`.localeCompare(`${right.sourceTable}\0${right.sourceKey}`));
  const declarations = adapted.map(value => value.declaration).sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
  const sourceEvidence = adapted.map(value => value.sourceEvidence).sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
  for (const item of items) { const key = `${item.domain}\0${item.sourceTable}\0${item.sourceKey}`; if (seen.has(key)) fail("YUZHOU_REUSABLE_INCREMENTAL_SOURCE_DUPLICATE"); seen.add(key); }
  const manifestBinding = { recipeVersion: RECIPE_VERSION, recipeSha256: YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256, sourceSystem: SOURCE_SYSTEM, extractedAt: input.extractedAt, typeMappingArtifactSha256: typeArtifact.artifactSha256, typeMappingTargetScope: typeArtifact.targetScope, itemSourceIdentities: items.map(item => item.sourceKey), itemRowDigests: items.map(item => item.rowDigest), declarations, sourceEvidence };
  const manifestId = `yuzhou-reusable-${sha256(canonical(manifestBinding))}`;
  const packageDto = items.length ? { version: 1, sourceSystem: SOURCE_SYSTEM, manifestId, extractedAt: input.extractedAt, items } : null;
  const coverage = { ...YUZHOU_REUSABLE_INCREMENTAL_COVERAGE, sourceFieldCoverage: sourceEvidence.map(value => ({ sourceIdentitySha256: value.sourceIdentitySha256, fieldCoverage: value.fieldCoverage })), pendingSourceRecords: declarations.filter(value => value.disposition !== "api_eligible").map(value => ({ sourceIdentitySha256: value.sourceIdentitySha256, disposition: value.disposition, reasonCode: value.reasonCode })) };
  return { packageDto, manifest: { formatVersion: 1, artifactKind: "yuzhou_reusable_incremental_package", productionImport: "HOLD", ...manifestBinding, manifestId, packageSha256: packageDto ? sha256(canonical(packageDto)) : null, supportedDomains: items.length ? ["contract"] : [], itemCount: items.length, disposition: items.length ? "api_package_ready" : "pending_normal_contract_workflow" }, coverage };
}

export function materializeYuzhouReusableIncrementalPackage({ inputPath, outputDir }) {
  const source = resolve(inputPath), destination = resolve(outputDir);
  if (!privateMode(source)) fail("YUZHOU_REUSABLE_INCREMENTAL_INPUT_UNSAFE");
  if (existsSync(destination)) {
    if (lstatSync(destination).isSymbolicLink() || !statSync(destination).isDirectory() || !privateDirectory(destination)) fail("YUZHOU_REUSABLE_INCREMENTAL_OUTPUT_UNSAFE");
  } else { mkdirSync(destination, { recursive: true, mode: 0o700 }); chmodSync(destination, 0o700); }
  const result = buildYuzhouReusableIncrementalPackage(readJson(source, "YUZHOU_REUSABLE_INCREMENTAL_INPUT_INVALID"));
  const packagePath = result.packageDto ? `${destination}/package.json` : null, manifestPath = `${destination}/manifest.json`, coveragePath = `${destination}/coverage.json`;
  if (packagePath) writePrivate(packagePath, result.packageDto); writePrivate(manifestPath, result.manifest); writePrivate(coveragePath, result.coverage);
  return { packagePath, manifestPath, coveragePath, manifestId: result.manifest.manifestId, itemCount: result.packageDto.items.length, productionImport: "HOLD" };
}

function parseArgs(argv) {
  const result = {}; for (let index = 0; index < argv.length; index += 2) { const key = argv[index], value = argv[index + 1]; if (!key?.startsWith("--") || !value || Object.hasOwn(result, key)) fail("YUZHOU_REUSABLE_INCREMENTAL_ARGUMENT_INVALID"); result[key.slice(2)] = value; }
  if (Object.keys(result).sort().join(",") !== "input,output") fail("YUZHOU_REUSABLE_INCREMENTAL_ARGUMENT_INVALID"); return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const args = parseArgs(process.argv.slice(2)); process.stdout.write(`${JSON.stringify(materializeYuzhouReusableIncrementalPackage({ inputPath: args.input, outputDir: args.output }))}\n`); }
  catch (error) { process.stderr.write(`YUZHOU_REUSABLE_INCREMENTAL_FAILED: ${error.message}\n`); process.exitCode = 1; }
}
