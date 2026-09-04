#!/usr/bin/env node
/* global process, structuredClone, URL */
import { createHash } from "node:crypto";
import { chmodSync, lstatSync, openSync, closeSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[0-9a-f]{64}$/u;
const RECEIPT_BODY_KEYS = [
  "formatVersion", "artifactKind", "sourceSystem", "scope", "sourceIdentities", "sourceBinding",
  "rootClassification", "matchClassification", "safeFacts", "decision", "reasonCode", "mergeAction",
  "materialization", "compatibilityCredit", "containsSourceValues", "containsSourceKeys",
  "containsPersonData", "productionImport",
];
const STAGE_BODY_KEYS = [
  "formatVersion", "artifactKind", "sourceSystem", "sourceBinding", "target", "counts", "records",
  "postgresLoad", "compatibilityCredit", "productionImport",
];
const FACT_FIELDS = [
  "companyRows", "departmentRows", "departmentRootRows", "companyBlankIdRows", "companyDistinctIdRows",
  "companyDuplicateIdGroups", "companyBlankMatchKeyRows", "companyDistinctMatchKeyRows",
  "companyDuplicateMatchKeyGroups", "departmentBlankKeyRows", "departmentDistinctKeyRows",
  "departmentDuplicateKeyGroups", "departmentRootBlankMatchKeyRows", "departmentRootDistinctMatchKeyRows",
  "departmentRootDuplicateMatchKeyGroups", "matchedPairRows", "companyZeroMatchRows", "companyUniqueMatchRows",
  "companyMultipleMatchRows", "departmentRootZeroMatchRows", "departmentRootUniqueMatchRows",
  "departmentRootMultipleMatchRows",
];
const CONTACT_LIMITS = { phone: 50, addr: 500, email: 254, master: 50 };
const TARGET_CONTACT_LIMITS = { contact_phone: 50, contact_address: 500, contact_email: 254, legacy_company_manager_reference: 50 };

export class LegacyCompanyContactPrivateStageError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyCompanyContactPrivateStageError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyCompanyContactPrivateStageError(code, detail); };
const hash = value => createHash("sha256").update(value).digest("hex");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const exactKeys = (value, keys) => object(value)
  && same(Object.keys(value).sort((a, b) => a.localeCompare(b, "en")), [...keys].sort((a, b) => a.localeCompare(b, "en")));
const canonicalFile = value => `${JSON.stringify(value, null, 2)}\n`;
const sealedHash = value => hash(`${JSON.stringify(value)}\n`);
const normalizedMatch = value => typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
const normalizedKey = value => typeof value === "string" ? value.trim() : "";

function readBoundFile(repositoryRoot, binding, label) {
  if (!exactKeys(binding, ["path", "sha256"]) || typeof binding.path !== "string" || !SHA256.test(binding.sha256 ?? "")) {
    fail("COMPANY_CONTACT_CONTRACT_INVALID", label);
  }
  const root = resolve(repositoryRoot);
  const path = resolve(root, binding.path);
  if (!path.startsWith(`${root}/`)) fail("COMPANY_CONTACT_CONTRACT_INVALID", `${label} path`);
  const bytes = readFileSync(path);
  if (hash(bytes) !== binding.sha256) {
    fail("COMPANY_CONTACT_EVIDENCE_DRIFT", label);
  }
  return bytes;
}

function validateContract(contract, repositoryRoot) {
  const expectedKeys = ["formatVersion", "contractKind", "sourceSystem", "scope", "mergeReceiptBinding", "source", "target", "targetEvidence", "privacyBoundary", "conservation", "execution"];
  if (!exactKeys(contract, expectedKeys) || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_company_contact_private_stage"
    || contract.sourceSystem !== "yuzhou-v10"
    || contract.scope !== "company_contacts_into_existing_department_root_candidates") {
    fail("COMPANY_CONTACT_CONTRACT_INVALID", "identity");
  }
  const merge = contract.mergeReceiptBinding;
  if (!exactKeys(merge, ["path", "sha256", "requiredArtifactKind", "requiredDecision", "requiresValidReceiptSeal", "requiresExactSourceRestoreReceiptSha256", "requiresExactDatabaseIdentitySha256", "requiresExactAggregateFacts"])
    || merge.path !== "scripts/hr-cutover/contracts/legacy-company-department-root-merge-receipt-v1.json"
    || !SHA256.test(merge.sha256 ?? "") || merge.requiredArtifactKind !== "yuzhou_hr_legacy_company_department_root_merge_receipt"
    || merge.requiredDecision !== "MERGE_ONE_TO_ONE_READY"
    || [merge.requiresValidReceiptSeal, merge.requiresExactSourceRestoreReceiptSha256, merge.requiresExactDatabaseIdentitySha256, merge.requiresExactAggregateFacts].some(value => value !== true)) {
    fail("COMPANY_CONTACT_CONTRACT_INVALID", "merge receipt binding");
  }
  const mergeAuthority = JSON.parse(readBoundFile(repositoryRoot, { path: merge.path, sha256: merge.sha256 }, "merge receipt contract").toString("utf8"));
  if (mergeAuthority.contractKind !== merge.requiredArtifactKind || mergeAuthority.scope !== "company_to_existing_department_root_one_to_one_merge"
    || mergeAuthority.rootRule?.classification !== "no_shorter_department_code_prefix_parent"
    || mergeAuthority.matchRule?.classification !== "trimmed_case_folded_exact_name_candidate"
    || mergeAuthority.productionImport !== "HOLD") fail("COMPANY_CONTACT_CONTRACT_INVALID", "merge authority");
  if (!Array.isArray(contract.targetEvidence) || contract.targetEvidence.length !== 2) fail("COMPANY_CONTACT_CONTRACT_INVALID", "target evidence");
  contract.targetEvidence.forEach((binding, index) => readBoundFile(repositoryRoot, binding, `target evidence ${index}`));
  if (!same(contract.source, {
    companyTable: "dbo.company", companyColumns: ["id", "company", "phone", "addr", "email", "master"],
    departmentTable: "dbo.departmentcode", departmentColumns: ["department", "departmentname"],
    rootRule: "no_shorter_department_code_prefix_parent", matchRule: "trimmed_case_folded_exact_name_candidate",
  }) || !same(contract.target, {
    table: "sys_org", operation: "update_existing_only", lookupColumn: "org_code",
    writableColumns: ["contact_phone", "contact_address", "contact_email", "legacy_company_manager_reference"],
    protectedLegacyColumn: "legacy_company_manager_reference",
    forbiddenWriteColumns: ["leader_user_id", "org_code", "org_name", "parent_id", "remark"],
  }) || !same(contract.privacyBoundary, {
    inputFileMode: "0600", outputFileMode: "0600", parentDirectoryMode: "0700", exclusiveCreate: true,
    stdoutContainsSourceValues: false, sourceValuesForbiddenFromErrors: true,
  }) || !same(contract.conservation, {
    companyRowsEqualCandidateRows: true, departmentRootRowsEqualCandidateRows: true,
    oneCandidatePerCompanySourceKey: true, oneCandidatePerDepartmentRootKey: true,
  }) || !same(contract.execution, {
    adapterMode: "private_stage_only", databaseConnections: "forbidden", postgresLoad: "NOT_EXECUTED",
    compatibilityCredit: 0, productionImport: "HOLD",
  })) {
    fail("COMPANY_CONTACT_CONTRACT_INVALID", "safety boundary");
  }
  return mergeAuthority;
}

function validateMergeReceipt(receipt, contract, mergeAuthority, sourceRestoreReceiptSha256, databaseIdentitySha256) {
  if (!SHA256.test(sourceRestoreReceiptSha256 ?? "") || !SHA256.test(databaseIdentitySha256 ?? "")) {
    fail("COMPANY_CONTACT_SOURCE_BINDING_INVALID", "expected source receipt hashes");
  }
  if (!exactKeys(receipt, [...RECEIPT_BODY_KEYS, "receiptSha256"]) || !SHA256.test(receipt.receiptSha256 ?? "")) {
    fail("COMPANY_CONTACT_MERGE_RECEIPT_INVALID", "shape");
  }
  const body = Object.fromEntries(RECEIPT_BODY_KEYS.map(key => [key, receipt[key]]));
  if (sealedHash(body) !== receipt.receiptSha256) fail("COMPANY_CONTACT_MERGE_RECEIPT_INVALID", "seal");
  if (receipt.artifactKind !== contract.mergeReceiptBinding.requiredArtifactKind
    || receipt.scope !== mergeAuthority.scope
    || receipt.rootClassification !== mergeAuthority.rootRule.classification
    || receipt.matchClassification !== mergeAuthority.matchRule.classification
    || receipt.decision !== contract.mergeReceiptBinding.requiredDecision
    || receipt.mergeAction !== "MERGE_COMPANY_FIELDS_INTO_MATCHED_DEPARTMENT_ROOT"
    || receipt.materialization !== "NOT_EXECUTED" || receipt.compatibilityCredit !== 0
    || receipt.productionImport !== "HOLD" || receipt.containsSourceValues !== false
    || receipt.containsSourceKeys !== false || receipt.containsPersonData !== false) {
    fail("COMPANY_CONTACT_STAGE_HOLD", "merge receipt is not ready");
  }
  const binding = receipt.sourceBinding;
  if (!exactKeys(binding, ["sourceRestoreReceiptSha256", "databaseIdentitySha256", "companyRootFieldReceiptSha256", "organizationPositionMapSha256", "currentHierarchyMaterializerSha256", "catalogSha256", "aggregateQuerySha256", "aggregateSha256"])
    || Object.values(binding).some(value => !SHA256.test(value ?? ""))
    || binding.sourceRestoreReceiptSha256 !== sourceRestoreReceiptSha256
    || binding.databaseIdentitySha256 !== databaseIdentitySha256
    || binding.companyRootFieldReceiptSha256 !== mergeAuthority.evidenceBindings.companyRootFieldReceipt.sha256
    || binding.organizationPositionMapSha256 !== mergeAuthority.evidenceBindings.organizationPositionMap.sha256
    || binding.currentHierarchyMaterializerSha256 !== mergeAuthority.evidenceBindings.currentHierarchyMaterializer.sha256
    || binding.aggregateSha256 !== hash(`${JSON.stringify(receipt.safeFacts)}\n`)) {
    fail("COMPANY_CONTACT_SOURCE_BINDING_INVALID", "source receipt hashes differ");
  }
}

function validateCompanyRows(rows) {
  if (!Array.isArray(rows)) fail("COMPANY_CONTACT_SOURCE_INVALID", "company rows");
  return rows.map((row, index) => {
    if (!exactKeys(row, ["id", "company", "phone", "addr", "email", "master"])
      || !Number.isSafeInteger(row.id) || normalizedMatch(row.company) === "") {
      fail("COMPANY_CONTACT_SOURCE_INVALID", `company row ${index}`);
    }
    for (const field of Object.keys(CONTACT_LIMITS)) {
      if (!(row[field] === null || typeof row[field] === "string")) fail("COMPANY_CONTACT_SOURCE_INVALID", `company ${field} type`);
      if (typeof row[field] === "string" && row[field].trim().length > CONTACT_LIMITS[field]) fail("COMPANY_CONTACT_STAGE_HOLD", `company ${field} target length`);
    }
    return structuredClone(row);
  });
}

function validateDepartmentRows(rows) {
  if (!Array.isArray(rows)) fail("COMPANY_CONTACT_SOURCE_INVALID", "department rows");
  return rows.map((row, index) => {
    if (!exactKeys(row, ["department", "departmentname"]) || normalizedKey(row.department) === "" || normalizedMatch(row.departmentname) === "") {
      fail("COMPANY_CONTACT_SOURCE_INVALID", `department row ${index}`);
    }
    return structuredClone(row);
  });
}

const duplicateGroups = values => [...values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map()).values()].filter(count => count > 1).length;
const distinctCount = values => new Set(values).size;

function deriveFacts(companyRows, departmentRows) {
  const companyIds = companyRows.map(row => row.id);
  const companyMatches = companyRows.map(row => normalizedMatch(row.company));
  const departmentKeys = departmentRows.map(row => normalizedKey(row.department));
  const roots = departmentRows.filter(child => !departmentRows.some(parent => {
    const childKey = normalizedKey(child.department), parentKey = normalizedKey(parent.department);
    return parentKey.length < childKey.length && childKey.startsWith(parentKey);
  }));
  const rootMatches = roots.map(row => normalizedMatch(row.departmentname));
  const companyMatchCounts = companyMatches.map(key => rootMatches.filter(candidate => candidate === key).length);
  const rootMatchCounts = rootMatches.map(key => companyMatches.filter(candidate => candidate === key).length);
  return {
    roots,
    facts: {
      companyRows: companyRows.length, departmentRows: departmentRows.length, departmentRootRows: roots.length,
      companyBlankIdRows: 0, companyDistinctIdRows: distinctCount(companyIds), companyDuplicateIdGroups: duplicateGroups(companyIds),
      companyBlankMatchKeyRows: 0, companyDistinctMatchKeyRows: distinctCount(companyMatches), companyDuplicateMatchKeyGroups: duplicateGroups(companyMatches),
      departmentBlankKeyRows: 0, departmentDistinctKeyRows: distinctCount(departmentKeys), departmentDuplicateKeyGroups: duplicateGroups(departmentKeys),
      departmentRootBlankMatchKeyRows: 0, departmentRootDistinctMatchKeyRows: distinctCount(rootMatches), departmentRootDuplicateMatchKeyGroups: duplicateGroups(rootMatches),
      matchedPairRows: companyMatchCounts.reduce((sum, count) => sum + count, 0),
      companyZeroMatchRows: companyMatchCounts.filter(count => count === 0).length,
      companyUniqueMatchRows: companyMatchCounts.filter(count => count === 1).length,
      companyMultipleMatchRows: companyMatchCounts.filter(count => count > 1).length,
      departmentRootZeroMatchRows: rootMatchCounts.filter(count => count === 0).length,
      departmentRootUniqueMatchRows: rootMatchCounts.filter(count => count === 1).length,
      departmentRootMultipleMatchRows: rootMatchCounts.filter(count => count > 1).length,
    },
  };
}

const nullableTrimmed = value => typeof value === "string" && value.trim() !== "" ? value.trim() : null;

export function createLegacyCompanyContactPrivateStage({ contract, repositoryRoot, mergeReceipt, sourceRestoreReceiptSha256, databaseIdentitySha256, companyRows, departmentRows }) {
  const mergeAuthority = validateContract(contract, repositoryRoot);
  validateMergeReceipt(mergeReceipt, contract, mergeAuthority, sourceRestoreReceiptSha256, databaseIdentitySha256);
  const companies = validateCompanyRows(companyRows);
  const departments = validateDepartmentRows(departmentRows);
  const { roots, facts } = deriveFacts(companies, departments);
  if (!same(Object.fromEntries(FACT_FIELDS.map(field => [field, facts[field]])), mergeReceipt.safeFacts)) {
    fail("COMPANY_CONTACT_STAGE_HOLD", "aggregate facts differ");
  }
  if (companies.length === 0 || roots.length === 0 || companies.length !== roots.length
    || facts.companyUniqueMatchRows !== companies.length || facts.departmentRootUniqueMatchRows !== roots.length
    || facts.companyDuplicateIdGroups > 0 || facts.departmentDuplicateKeyGroups > 0) {
    fail("COMPANY_CONTACT_STAGE_HOLD", "one-to-one conservation failed");
  }
  const records = companies.map(company => {
    const root = roots.find(row => normalizedMatch(row.departmentname) === normalizedMatch(company.company));
    if (!root) fail("COMPANY_CONTACT_STAGE_HOLD", "matched root absent");
    return {
      operation: "update_existing_only",
      targetTable: "sys_org",
      lookup: { org_code: normalizedKey(root.department) },
      sourceIdentitySha256: hash(`dbo.company\0${company.id}`),
      matchedRootIdentitySha256: hash(`dbo.departmentcode\0${normalizedKey(root.department)}`),
      patch: {
        contact_phone: nullableTrimmed(company.phone),
        contact_address: nullableTrimmed(company.addr),
        contact_email: nullableTrimmed(company.email),
        legacy_company_manager_reference: nullableTrimmed(company.master),
      },
    };
  });
  const body = {
    formatVersion: 1,
    artifactKind: contract.contractKind,
    sourceSystem: contract.sourceSystem,
    sourceBinding: {
      sourceRestoreReceiptSha256,
      databaseIdentitySha256,
      mergeReceiptSha256: mergeReceipt.receiptSha256,
      mergeReceiptContractSha256: contract.mergeReceiptBinding.sha256,
    },
    target: { table: "sys_org", operation: "update_existing_only", lookupColumn: "org_code" },
    counts: { companyRows: companies.length, departmentRootRows: roots.length, candidateRows: records.length },
    records,
    postgresLoad: "NOT_EXECUTED",
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  const stage = { ...body, stageSha256: sealedHash(body) };
  const safeReceipt = {
    formatVersion: 1,
    artifactKind: `${contract.contractKind}_safe_receipt`,
    sourceBinding: structuredClone(stage.sourceBinding),
    counts: structuredClone(stage.counts),
    stageSha256: stage.stageSha256,
    privateOutputMode: "0600",
    containsSourceValues: false,
    postgresLoad: "NOT_EXECUTED",
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  return { stage, safeReceipt };
}

export function validateLegacyCompanyContactPrivateStage(stage) {
  if (!exactKeys(stage, [...STAGE_BODY_KEYS, "stageSha256"]) || !SHA256.test(stage.stageSha256 ?? "")) {
    fail("COMPANY_CONTACT_PRIVATE_STAGE_INVALID", "shape");
  }
  const body = Object.fromEntries(STAGE_BODY_KEYS.map(key => [key, stage[key]]));
  if (sealedHash(body) !== stage.stageSha256 || stage.formatVersion !== 1
    || stage.artifactKind !== "yuzhou_hr_legacy_company_contact_private_stage"
    || stage.sourceSystem !== "yuzhou-v10"
    || !same(stage.target, { table: "sys_org", operation: "update_existing_only", lookupColumn: "org_code" })
    || stage.postgresLoad !== "NOT_EXECUTED" || stage.compatibilityCredit !== 0 || stage.productionImport !== "HOLD") {
    fail("COMPANY_CONTACT_PRIVATE_STAGE_INVALID", "seal or boundary");
  }
  if (!exactKeys(stage.sourceBinding, ["sourceRestoreReceiptSha256", "databaseIdentitySha256", "mergeReceiptSha256", "mergeReceiptContractSha256"])
    || Object.values(stage.sourceBinding).some(value => !SHA256.test(value ?? ""))
    || !exactKeys(stage.counts, ["companyRows", "departmentRootRows", "candidateRows"])
    || Object.values(stage.counts).some(value => !Number.isSafeInteger(value) || value < 0)
    || stage.counts.companyRows !== stage.counts.candidateRows
    || stage.counts.departmentRootRows !== stage.counts.candidateRows
    || !Array.isArray(stage.records) || stage.records.length !== stage.counts.candidateRows) {
    fail("COMPANY_CONTACT_PRIVATE_STAGE_INVALID", "binding or conservation");
  }
  const sourceIdentities = new Set(), rootIdentities = new Set(), lookups = new Set();
  for (const record of stage.records) {
    if (!exactKeys(record, ["operation", "targetTable", "lookup", "sourceIdentitySha256", "matchedRootIdentitySha256", "patch"])
      || record.operation !== "update_existing_only" || record.targetTable !== "sys_org"
      || !exactKeys(record.lookup, ["org_code"]) || normalizedKey(record.lookup.org_code) === ""
      || !SHA256.test(record.sourceIdentitySha256 ?? "") || !SHA256.test(record.matchedRootIdentitySha256 ?? "")
      || !exactKeys(record.patch, ["contact_phone", "contact_address", "contact_email", "legacy_company_manager_reference"])) {
      fail("COMPANY_CONTACT_PRIVATE_STAGE_INVALID", "record shape");
    }
    for (const [field, value] of Object.entries(record.patch)) {
      if (!(value === null || typeof value === "string" && value.trim() === value && value !== "")) {
        fail("COMPANY_CONTACT_PRIVATE_STAGE_INVALID", "record value");
      }
      if (typeof value === "string" && value.length > TARGET_CONTACT_LIMITS[field]) {
        fail("COMPANY_CONTACT_PRIVATE_STAGE_INVALID", "record target length");
      }
    }
    if (sourceIdentities.has(record.sourceIdentitySha256) || rootIdentities.has(record.matchedRootIdentitySha256)
      || lookups.has(record.lookup.org_code)) fail("COMPANY_CONTACT_PRIVATE_STAGE_INVALID", "record uniqueness");
    sourceIdentities.add(record.sourceIdentitySha256);
    rootIdentities.add(record.matchedRootIdentitySha256);
    lookups.add(record.lookup.org_code);
  }
  return structuredClone(stage);
}

function validatePrivateFile(path, label) {
  if (!isAbsolute(path)) fail("COMPANY_CONTACT_PRIVATE_FILE_INVALID", `${label} must be absolute`);
  const link = lstatSync(path), file = statSync(path);
  if (link.isSymbolicLink() || !file.isFile() || file.uid !== process.getuid() || file.nlink !== 1 || (file.mode & 0o777) !== 0o600) {
    fail("COMPANY_CONTACT_PRIVATE_FILE_INVALID", `${label} boundary`);
  }
}

export function readLegacyCompanyContactPrivateJson(path, label) {
  validatePrivateFile(path, label);
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { fail("COMPANY_CONTACT_PRIVATE_FILE_INVALID", `${label} JSON`); }
}

export function writeLegacyCompanyContactPrivateStageFile(path, stage) {
  const validatedStage = validateLegacyCompanyContactPrivateStage(stage);
  if (!isAbsolute(path)) fail("COMPANY_CONTACT_PRIVATE_OUTPUT_INVALID", "output must be absolute");
  const parentLink = lstatSync(dirname(path)), parent = statSync(dirname(path));
  if (parentLink.isSymbolicLink() || !parent.isDirectory() || parent.uid !== process.getuid() || (parent.mode & 0o777) !== 0o700) {
    fail("COMPANY_CONTACT_PRIVATE_OUTPUT_INVALID", "parent boundary");
  }
  let descriptor;
  try {
    descriptor = openSync(path, "wx", 0o600);
    writeFileSync(descriptor, canonicalFile(validatedStage));
  } catch (error) {
    if (error?.code === "EEXIST") fail("COMPANY_CONTACT_PRIVATE_OUTPUT_EXISTS", "exclusive create required");
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(path, 0o600);
  validatePrivateFile(path, "output");
}

function parseArgs(argv) {
  const values = {};
  const allowed = new Set(["--company-source", "--department-source", "--merge-receipt", "--output", "--source-restore-receipt-sha256", "--database-identity-sha256"]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!allowed.has(key) || !value || value.startsWith("--")) fail("COMPANY_CONTACT_ARGUMENT_INVALID", "arguments");
    values[key.slice(2).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase())] = value;
  }
  if (Object.keys(values).length !== allowed.size) fail("COMPANY_CONTACT_ARGUMENT_INVALID", "required arguments");
  return values;
}

function cli() {
  const args = parseArgs(process.argv.slice(2));
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-company-contact-private-stage-v1.json"), "utf8"));
  const result = createLegacyCompanyContactPrivateStage({
    contract, repositoryRoot,
    mergeReceipt: readLegacyCompanyContactPrivateJson(resolve(args.mergeReceipt), "merge receipt"),
    sourceRestoreReceiptSha256: args.sourceRestoreReceiptSha256,
    databaseIdentitySha256: args.databaseIdentitySha256,
    companyRows: readLegacyCompanyContactPrivateJson(resolve(args.companySource), "company source"),
    departmentRows: readLegacyCompanyContactPrivateJson(resolve(args.departmentSource), "department source"),
  });
  writeLegacyCompanyContactPrivateStageFile(resolve(args.output), result.stage);
  process.stdout.write(canonicalFile(result.safeReceipt));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(); }
  catch (error) {
    process.stderr.write(`${error instanceof LegacyCompanyContactPrivateStageError ? error.message : "COMPANY_CONTACT_PRIVATE_STAGE_FAILED"}\n`);
    process.exitCode = 1;
  }
}
