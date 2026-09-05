import { createHash } from "node:crypto";
import { verifyProductionSourceManifest } from "../prepare-yuzhou-production-source-manifest.mjs";
import { evaluateCoreT0JobStatePolicy } from "./build-core-t0-machine-package.mjs";
import { canonicalHash } from "./materialize-reviewed-job-state.mjs";
import { verifyYuzhouJobStateDecisionArtifact } from "./yuzhou-job-state-decision-artifact-lib.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const domains = Object.freeze({ departments: "departments.jsonl", positions: "positions.jsonl", employees: "employees.jsonl", employeeJobStates: "employee-job-states.raw.json", jobStateCodeMetadata: "job-state-code-metadata.raw.json", jobStateCodes: "job-state-codes.raw.json" });
const dictionaryKeys = Object.freeze(["employeeJobStates", "jobStateCodeMetadata", "jobStateCodes"]);
const fail = suffix => { const error = new Error(`PRODUCTION_IMPORT_JOB_STATE_REVALIDATION_${suffix}`); error.code = error.message; throw error; };
const exact = (value, keys) => {
  if (!plain(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail("SHAPE_INVALID");
};
const bytesOf = value => {
  if (!(value instanceof Uint8Array) || value.byteLength > 32 * 1024 * 1024) fail("BYTES_INVALID");
  return Buffer.from(value);
};
const parse = bytes => { try { return JSON.parse(bytes.toString("utf8")); } catch { fail("JSON_INVALID"); } };
const codeOf = value => {
  if (typeof value !== "string" || value.trim() === "") fail("SOURCE_CODE_INVALID");
  return value.trim().toLowerCase();
};

/**
 * Candidate-only reuse of original source semantics. Historical C/M, scope and
 * checkpoint remain provenance, never current approvals. employeeRows must be
 * supplied by the existing T0 byte/row-hash validator, not a database query.
 */
export function verifyProductionJobStateSourceRevalidation({ decision, triple, sourceManifest, stageManifestBytes, dictionaryBytes, employeeRows }) {
  exact(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
  if (!/^[0-9a-f]{40}$/u.test(triple.codeSha ?? "") || !/^[0-9a-f]{64}$/u.test(triple.sourceSnapshotHash ?? "") || !/^[0-9a-f]{64}$/u.test(triple.mappingContractHash ?? "")) fail("TRIPLE_INVALID");
  let verified;
  try { verifyProductionSourceManifest(sourceManifest); verified = verifyYuzhouJobStateDecisionArtifact(decision); }
  catch { fail("ARTIFACT_INVALID"); }
  if (decision.formatVersion !== 2 || verified.machineAssertion !== "PASS" || verified.observedRecordCount !== 2949
    || decision.triple.sourceSnapshotHash !== triple.sourceSnapshotHash
    || sourceManifest.sourceSnapshotSha256 !== triple.sourceSnapshotHash || sourceManifest.mappingContractSha256 !== triple.mappingContractHash) fail("SOURCE_BINDING_MISMATCH");
  const manifestBytes = bytesOf(stageManifestBytes), manifest = parse(manifestBytes);
  if (hash(manifestBytes) !== sourceManifest.phases.T0.stageManifestSha256 || !plain(manifest) || manifest.formatVersion !== 1) fail("STAGE_MANIFEST_MISMATCH");
  exact(manifest.domains, Object.keys(domains));
  for (const [key, filename] of Object.entries(domains)) {
    const item = manifest.domains[key], bound = sourceManifest.phases.T0.domains[key];
    exact(item, ["rows", "file", "fileSha256"]);
    if (item.file !== filename || item.rows !== bound.rows || item.fileSha256 !== bound.fileSha256) fail("STAGE_DOMAIN_MISMATCH");
  }
  for (const field of ["sourceSnapshotSha256", "sourceRestoreReceiptSha256", "sourceCatalogSha256", "mappingContractSha256"]) {
    if (manifest[field] !== undefined && manifest[field] !== sourceManifest[field]) fail("STAGE_BINDING_MISMATCH");
  }
  if (manifest.productionImport !== undefined && manifest.productionImport !== "HOLD") fail("STAGE_BINDING_MISMATCH");
  exact(dictionaryBytes, dictionaryKeys);
  const parsed = {}, dictionaryHashes = {};
  for (const key of dictionaryKeys) {
    const bytes = bytesOf(dictionaryBytes[key]), digest = hash(bytes), rows = parse(bytes);
    if (digest !== manifest.domains[key].fileSha256 || digest !== decision.evidenceIndex[`${key}Sha256`]) fail("DICTIONARY_HASH_MISMATCH");
    if (!Array.isArray(rows) || rows.length !== manifest.domains[key].rows || rows.some(row => !plain(row))) fail("DICTIONARY_COUNT_MISMATCH");
    parsed[key] = rows; dictionaryHashes[`${key}Sha256`] = digest;
  }
  const states = parsed.employeeJobStates, codes = parsed.jobStateCodes;
  if (states.length !== 7 || codes.length !== 8 || !Array.isArray(employeeRows) || employeeRows.length !== 2949 || employeeRows.length !== manifest.domains.employees.rows) fail("SOURCE_COUNT_MISMATCH");
  const dictionary = new Map();
  for (const row of codes) {
    const code = codeOf(row.sourceCode);
    if (dictionary.has(code)) fail("DUPLICATE_SOURCE_CODE");
    dictionary.set(code, row);
  }
  const usage = new Map();
  for (const row of employeeRows) {
    const code = codeOf(row?.source?.legacyStatus);
    usage.set(code, (usage.get(code) ?? 0) + 1);
  }
  if (usage.size !== 7) fail("SOURCE_COUNT_MISMATCH");
  const aggregate = canonicalHash({ ...dictionaryHashes, sourceDictionaryRowCount: codes.length, sourceDistinctStateCount: states.length, sourceRecordCount: employeeRows.length });
  if (aggregate !== decision.sourceContract.sourceSnapshotSha256) fail("DICTIONARY_SNAPSHOT_MISMATCH");
  const original = new Map(decision.decisions.map(row => [row.sourceIdentitySha256, row]));
  const decisions = new Map(), seen = new Set();
  for (const row of states) {
    const normalized = codeOf(row.sourceCode), source = dictionary.get(normalized), status = evaluateCoreT0JobStatePolicy(normalized);
    if (seen.has(normalized) || !source || status === null || !Number.isSafeInteger(row.usageCount) || row.usageCount < 1 || usage.get(normalized) !== row.usageCount) fail("SOURCE_USAGE_MISMATCH");
    seen.add(normalized);
    const sourceIdentitySha256 = hash(`dbo.person.jobstate\0${normalized}`);
    const expected = { sourceIdentitySha256, sourceRowSha256: canonicalHash({ sourceCode: row.sourceCode.trim(), usageCount: row.usageCount, dictionaryRowSha256: canonicalHash(source) }), observedRecordCount: row.usageCount, decision: "map", targetEmploymentStatus: status, semanticClassification: "derived_deterministic", reasonCode: "DETERMINISTIC_MAPPING" };
    if (!original.has(sourceIdentitySha256) || canonicalHash(original.get(sourceIdentitySha256)) !== canonicalHash(expected)) fail("POLICY_DECISION_MISMATCH");
    decisions.set(sourceIdentitySha256, Object.freeze(expected));
  }
  return Object.freeze({ decisions, sourceDistinctStateCount: states.length, sourceRecordCount: employeeRows.length, originalTriple: Object.freeze({ ...decision.triple }) });
}
