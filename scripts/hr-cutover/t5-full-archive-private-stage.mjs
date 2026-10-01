import { readBoundedPrivateArtifactBytes } from "./execute-production-import.mjs";
import { canonicalT4, hashT4 } from "./production-import-t4-followon-binding.mjs";
import { Buffer } from "node:buffer";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { t5DomainBatchItemsFromManifest } from "./t5-stage-domain-items.mjs";
export const T5_RECORD_DOMAINS = Object.freeze({ accept: "candidate", family: "family", his: "experience",
  knowhow: "skill", ticket: "credential", person_core: "employee_profile_raw", person_user: "employee_profile_raw",
  person_user_item: "employee_profile_raw", readjust: "employment_change_raw", readjustitem: "employment_change_raw",
  jobstatecode: "employment_change_raw", compact: "contract_raw", compact_c: "contract_raw", compacttypecode: "contract_raw",
  course: "training_course", train: "training_history", trainhis: "training_history", jobtrain: "training_course",
  bonuscode: "reward_category", bonusrecord: "reward_history", jch_1: "reward_history" });

export const T5_FULL_COUNTS = Object.freeze({ accept: 0, family: 4560, his: 375, knowhow: 6,
  ticket: 237, person_core: 2949, person_user: 0, person_user_item: 8, readjust: 6887,
  readjustitem: 8, jobstatecode: 8, compact: 802, compact_c: 357, compacttypecode: 4,
  photo: 2949, docs: 1003, course: 0, train: 0, trainhis: 2, jobtrain: 0,
  bonuscode: 8, bonusrecord: 0, jch_1: 0 });
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sha = value => /^[a-f0-9]{64}$/u.test(value ?? "");
function read(descriptor, maximumBytes = 64 * 1024 * 1024) {
  if (!descriptor || Object.keys(descriptor).sort().join(",") !== "path,sha256" || !sha(descriptor.sha256)) fail("T5_STAGE_DESCRIPTOR_INVALID");
  const bytes = readBoundedPrivateArtifactBytes(descriptor.path, "T5 source artifact", maximumBytes);
  if (hashT4(bytes) !== descriptor.sha256) fail("T5_STAGE_ARTIFACT_HASH_MISMATCH");
  return bytes;
}
function readEmpty(descriptor) {
  if (!descriptor || Object.keys(descriptor).sort().join(",") !== "path,sha256"
    || descriptor.sha256 !== hashT4(Buffer.alloc(0)) || typeof descriptor.path !== "string"
    || !isAbsolute(descriptor.path) || resolve(descriptor.path) !== descriptor.path
    || descriptor.path.includes("\0")) fail("T5_STAGE_EMPTY_DESCRIPTOR_INVALID");
  let fd;
  try {
    fd = openSync(descriptor.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || (before.mode & 0o777) !== 0o600
      || before.uid !== globalThis.process.getuid() || before.size !== 0
      || readSync(fd, Buffer.alloc(1), 0, 1, null) !== 0) fail("T5_STAGE_EMPTY_FILE_UNSAFE");
    const after = fstatSync(fd);
    if (after.size !== 0 || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) fail("T5_STAGE_EMPTY_FILE_CHANGED");
    return Buffer.alloc(0);
  } finally { if (fd !== undefined) closeSync(fd); }
}
function lines(bytes) {
  if (!bytes.length) return [];
  if (bytes.at(-1) !== 10) fail("T5_STAGE_JSONL_UNTERMINATED");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).slice(0, -1).split("\n").map(line => {
      // The source transform doubles every backslash for PostgreSQL COPY text.
      // Decode exactly that transport layer before JSON; retain original bytes.
      let decoded = "";
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] === "\\") {
          if (line[i + 1] !== "\\") fail("T5_STAGE_COPY_ESCAPE_INVALID");
          i += 1;
        }
        decoded += line[i];
      }
      const value = JSON.parse(decoded);
      if (!value || typeof value !== "object" || Array.isArray(value)) fail("T5_STAGE_ROW_INVALID");
      return value;
    });
  } catch { fail("T5_STAGE_JSONL_INVALID"); }
}

/** Authenticate the complete source, including empty domains and forbidden SQL
 * definition evidence. Retained buffers are the writer's input; it must never
 * reopen these paths. This reader grants no production authorization. */
export function readT5FullArchivePrivateStage(input, binding) {
  const manifestBytes = read(input.manifest, 1024 * 1024);
  if (input.manifest.sha256 !== binding.manifestSha256) fail("T5_STAGE_MANIFEST_BINDING_DRIFT");
  const manifest = JSON.parse(manifestBytes);
  if (manifest.formatVersion !== 1 || manifest.productionImport !== "HOLD"
    || manifest.payloadSanitization !== "nul_to_literal_escape_v1"
    || manifest.mappingContractSha256 !== binding.mappingContractSha256
    || manifest.businessSha256 !== binding.businessSha256
    || manifest.catalogSha256 !== binding.catalogSha256) fail("T5_STAGE_SOURCE_BINDING_DRIFT");
  if (Object.keys(manifest.domains).sort().join(",") !== Object.keys(T5_FULL_COUNTS).sort().join(",")
    || Object.keys(input.files).sort().join(",") !== Object.keys(T5_FULL_COUNTS).sort().join(",")) fail("T5_STAGE_DOMAIN_SET_DRIFT");
  const business = { formatVersion: manifest.formatVersion, catalogSha256: manifest.catalogSha256,
    mappingContractSha256: manifest.mappingContractSha256,
    professionalTitleDictionary: manifest.professionalTitleDictionary, domains: manifest.domains };
  if (hashT4(canonicalT4(business)) !== manifest.businessSha256) fail("T5_STAGE_BUSINESS_HASH_DRIFT");
  const catalogBytes = read(input.catalog);
  if (hashT4(canonicalT4(JSON.parse(catalogBytes))) !== manifest.catalogSha256) fail("T5_STAGE_CATALOG_HASH_DRIFT");
  const buffers = {}, records = [], seen = new Set();
  t5DomainBatchItemsFromManifest(manifest);
  for (const [domain, expected] of Object.entries(T5_FULL_COUNTS)) {
    const item = manifest.domains[domain], descriptor = input.files[domain];
    if (item.rows !== expected || item.file !== `${domain}.jsonl`
      || descriptor.sha256 !== item.fileSha256) fail("T5_STAGE_DOMAIN_BINDING_DRIFT");
    const bytes = expected === 0 ? readEmpty(descriptor) : read(descriptor), rows = lines(bytes);
    if (rows.length !== expected) fail("T5_STAGE_DOMAIN_COUNT_DRIFT");
    for (const row of rows) {
      const expectedDomain = T5_RECORD_DOMAINS[domain];
      if ((expectedDomain ? row.domain !== expectedDomain : Object.hasOwn(row, "domain")) || row.sourceTable !== item.sourceObject
        || !sha(row.sourceIdentitySha256) || !sha(row.sourceRowSha256)
        || !row.source || typeof row.source !== "object" || Array.isArray(row.source)) fail("T5_STAGE_SOURCE_ROW_DRIFT");
      if (["photo", "docs"].includes(domain) && row.fileRole !== (domain === "photo" ? "employee_photo" : "employee_document")) fail("T5_STAGE_FILE_ROLE_DRIFT");
      const id = `${row.sourceTable}:${row.sourceIdentitySha256}`;
      if (seen.has(id)) fail("T5_STAGE_DUPLICATE_SOURCE_IDENTITY");
      seen.add(id); records.push(row);
    }
    buffers[domain] = bytes;
  }
  const defs = manifest.privateDefinitionSource;
  if (defs?.sourceObject !== "dbo.defs" || defs.rows !== 19 || defs.logicColumnDenominator !== 190
    || defs.logicColumnPresentCount !== 95 || defs.file !== "defs.private.jsonl"
    || defs.safeEvidenceFile !== "defs.safe-evidence.jsonl"
    || input.definitions.sha256 !== defs.fileSha256
    || input.safeDefinitionEvidence.sha256 !== defs.safeEvidenceFileSha256) fail("T5_STAGE_DEFINITION_BINDING_DRIFT");
  const definitionBytes = read(input.definitions), safeDefinitionEvidenceBytes = read(input.safeDefinitionEvidence);
  const definitionRecords = lines(definitionBytes), definitionEvidence = lines(safeDefinitionEvidenceBytes);
  if (definitionRecords.length !== 19 || definitionEvidence.length !== 19) fail("T5_STAGE_DEFINITION_COUNT_DRIFT");
  if (definitionRecords.some(row => row.privateOnly !== true || row.execution !== "forbidden")) fail("T5_STAGE_DEFINITION_EXECUTION_DRIFT");
  let present = 0;
  for (const row of definitionEvidence) {
    const coverage = row.legacyLogicCoverage;
    if (coverage?.denominator !== 10 || !Array.isArray(coverage.columns) || coverage.columns.length !== 10) fail("T5_STAGE_LOGIC_COVERAGE_DRIFT");
    const n = coverage.columns.filter(column => column.isSourceNull === false).length;
    if (coverage.presentCount !== n || coverage.nullCount !== 10 - n
      || coverage.columns.some(column => column.execution !== "forbidden" || typeof column.isSourceNull !== "boolean"
        || (column.isSourceNull ? column.sourceValueSha256 !== null : !sha(column.sourceValueSha256)))) fail("T5_STAGE_LOGIC_COVERAGE_DRIFT");
    present += n;
  }
  if (present !== 95) fail("T5_STAGE_LOGIC_COVERAGE_DRIFT");
  return { manifest, manifestBytes, catalogBytes, buffers, records, definitionRecords, definitionEvidence,
    definitionBytes, safeDefinitionEvidenceBytes,
    receipt: { status: "T5_FULL_ARCHIVE_SOURCE_VERIFIED", domains: 23, sourceRecords: records.length,
      definitionRecords: 19, logicColumns: 190, presentLogicColumns: 95,
      productionBusinessWrites: 0, productionAuthorizationGranted: false } };
}
