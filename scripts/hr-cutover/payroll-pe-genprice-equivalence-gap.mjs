#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED_ROUTINE_ID = "RULE-81CAC314D2F3C517";
const EXPECTED_PARAMETERS = [["productid", "int"], ["date", "datetime"]];
const EXPECTED_READ_TABLES = ["product", "workprocedure", "workprocedureitem"];
const EXPECTED_WRITE_TABLES = ["pieceprice"];
const EXPECTED_JOINS = [
  "workprocedure.id=product.workprocedureid",
  "workprocedureitem.workprocedureid=workprocedure.id",
];
const EXPECTED_STATEMENTS = { select: 1, insert: 1, update: 0, delete: 0, merge: 0, alter: 0 };
const EXPECTED_GAPS = [
  "PE_GENPRICE_SOURCE_BODY_NOT_COMMITTED",
  "PE_GENPRICE_SELECT_INSERT_COLUMN_MAPPING_UNAVAILABLE",
  "PE_GENPRICE_NULL_DUPLICATE_DATE_TRANSACTION_SEMANTICS_UNPROVEN",
  "PIECEWORK_TARGET_SCHEMA_UNAVAILABLE",
  "BOUNDED_SYNTHETIC_PARITY_ORACLE_UNAVAILABLE",
];
const EXPECTED_ASSUMPTIONS = [
  "derive_insert_columns_from_table_names",
  "invent_piece_price_arithmetic",
  "invent_same_date_duplicate_behavior",
  "treat_generic_payroll_snapshot_tables_as_pieceprice_equivalence",
];

export class PayrollPeGenpriceEquivalenceGapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "PayrollPeGenpriceEquivalenceGapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new PayrollPeGenpriceEquivalenceGapError(code, detail); };
const digest = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function readBoundJson(repositoryRoot, evidence, label) {
  if (!object(evidence) || typeof evidence.path !== "string" || !evidence.path || !SHA256.test(evidence.sha256 ?? "")) {
    fail("PE_GENPRICE_EVIDENCE_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, evidence.path));
  if (digest(bytes) !== evidence.sha256) fail("PE_GENPRICE_EVIDENCE_DRIFT", label);
  return JSON.parse(bytes.toString("utf8"));
}

function eligiblePayrollRoutines(ledger, policy) {
  const excluded = new Set(policy.excludedFamilies);
  return ledger.routines.filter(row => row.primaryDomain === policy.sourceDomain
    && !excluded.has(row.canonicalFamily)
    && row.dynamicMutationStatus === policy.requiredDynamicMutationStatus
    && row.readTables?.length > 0
    && row.writeTables?.length > 0
    && row.joinPredicates?.length > 0
    && Array.isArray(row.calledRoutines));
}

function validateSelection(contract, ledger) {
  const policy = contract.selectionPolicy;
  if (!object(policy)
    || policy.sourceDomain !== "payroll"
    || !same(policy.excludedFamilies, ["u_inputbasepay", "u_inputjobpay"])
    || policy.requiredDynamicMutationStatus !== "none"
    || policy.requiredExplicitReadAndWriteTables !== true
    || policy.requiredExplicitJoinPredicates !== true
    || policy.requiredClosedCallSet !== true
    || !same(policy.expectedEligibleRoutineIds, [EXPECTED_ROUTINE_ID])) {
    fail("PE_GENPRICE_SELECTION_POLICY_INVALID", "policy");
  }
  const eligible = eligiblePayrollRoutines(ledger, policy).map(row => row.routineId);
  if (!same(eligible, policy.expectedEligibleRoutineIds)) fail("PE_GENPRICE_SELECTION_EVIDENCE_DRIFT", eligible.join(","));
}

function validateRoutine(contract, ledger) {
  const expected = contract.routineLedger.expectedRoutine;
  const routine = ledger.routines.find(row => row.routineId === contract.routineId);
  if (!routine
    || contract.routineId !== EXPECTED_ROUTINE_ID
    || contract.routineFamily !== "pe_genprice"
    || expected?.sourceName !== "pe_genprice"
    || expected.sourceArtifact !== "SQL_STORED_PROCEDURE_pe_genprice_sql"
    || expected.sourceArtifactSha256 !== "24966434a25d112d6e8c02d695b70708d765e2dbd16ffe90c4053a67e7d54c1d"
    || !same(expected.parameters, EXPECTED_PARAMETERS)
    || !same(expected.readTables, EXPECTED_READ_TABLES)
    || !same(expected.writeTables, EXPECTED_WRITE_TABLES)
    || !same(expected.calledRoutines, [])
    || !same(expected.joinPredicates, EXPECTED_JOINS)
    || !same(expected.statementProfile, EXPECTED_STATEMENTS)) {
    fail("PE_GENPRICE_ROUTINE_CONTRACT_INVALID", "expected routine");
  }
  const observed = {
    sourceName: routine.sourceName,
    sourceArtifact: routine.sourceArtifact,
    sourceArtifactSha256: routine.sourceArtifactSha256,
    parameters: routine.parameters?.map(row => [row.name, row.sourceType]),
    readTables: routine.readTables,
    writeTables: routine.writeTables,
    calledRoutines: routine.calledRoutines,
    joinPredicates: routine.joinPredicates,
    statementProfile: routine.statementProfile,
  };
  if (!same(observed, expected)
    || routine.canonicalFamily !== contract.routineFamily
    || routine.primaryDomain !== "payroll"
    || !routine.secondaryDomains?.includes("piecework")
    || routine.dynamicMutationStatus !== "none") {
    fail("PE_GENPRICE_ROUTINE_EVIDENCE_DRIFT", routine.sourceName ?? contract.routineId);
  }
  return observed;
}

function validateManifest(contract, repositoryRoot) {
  const evidence = contract.sourceManifest;
  if (!object(evidence)
    || evidence.sourceArtifactPath !== "玉舟人力资源管理系统分析产出/存储过程源码/SQL_STORED_PROCEDURE_pe_genprice_sql"
    || evidence.sourceArtifactBytes !== 407
    || evidence.sourceArtifactLines !== 12
    || evidence.sourceBodyStatus !== "hash_and_shape_only_body_not_committed") {
    fail("PE_GENPRICE_SOURCE_MANIFEST_CONTRACT_INVALID", "source artifact");
  }
  const manifest = readBoundJson(repositoryRoot, evidence, "source manifest");
  const source = manifest.files?.find(row => row.path === evidence.sourceArtifactPath);
  if (!source
    || source.kind !== "sql-source"
    || source.bytes !== evidence.sourceArtifactBytes
    || source.sha256 !== contract.routineLedger.expectedRoutine.sourceArtifactSha256
    || source.text?.encoding !== "utf-8"
    || source.text?.lines !== evidence.sourceArtifactLines) {
    fail("PE_GENPRICE_SOURCE_MANIFEST_DRIFT", evidence.sourceArtifactPath);
  }
  if (existsSync(resolve(repositoryRoot, evidence.sourceArtifactPath))) {
    fail("PE_GENPRICE_SOURCE_BODY_STATUS_DRIFT", "source body is now available and requires review");
  }
  return { sourceArtifactSha256: source.sha256, sourceArtifactBytes: source.bytes, sourceArtifactLines: source.text.lines, sourceBodyAvailable: false };
}

function validateBusinessPages(contract, repositoryRoot) {
  const evidence = contract.businessPageEvidence;
  const expected = [[76, "计件产品", "/hr/compensation"], [77, "计件工序", "/hr/compensation"], [201, "计件工资", "/hr/payroll"]];
  if (!same(evidence?.requiredLegacyPages?.map(row => [row.legacyId, row.name, row.targetRoute]), expected)) {
    fail("PE_GENPRICE_PAGE_CONTRACT_INVALID", "page evidence");
  }
  const mapping = readBoundJson(repositoryRoot, evidence, "business page mapping");
  for (const required of evidence.requiredLegacyPages) {
    const page = mapping.items?.find(row => row.legacyId === required.legacyId);
    if (!page || page.name !== required.name || !page.targetRoutes?.includes(required.targetRoute) || page.mappingStatus !== "mapped") {
      fail("PE_GENPRICE_PAGE_EVIDENCE_DRIFT", String(required.legacyId));
    }
  }
  return evidence.requiredLegacyPages.map(row => ({ legacyId: row.legacyId, name: row.name, targetRoute: row.targetRoute }));
}

function validateModernTargetGap(contract, repositoryRoot) {
  const evidence = contract.modernTargetEvidence;
  if (!object(evidence)
    || evidence.domain !== "piecework"
    || !same(evidence.requiredSourceTables, EXPECTED_READ_TABLES)
    || evidence.expectedFunctionalStatus !== "target_schema_required"
    || !same(evidence.expectedTargetServices, [])
    || !same(evidence.expectedTargetApis, [])
    || !same(evidence.expectedTargetPages, [])) {
    fail("PE_GENPRICE_MODERN_TARGET_CONTRACT_INVALID", "piecework target");
  }
  const tableMap = readBoundJson(repositoryRoot, evidence.tableDomainMap, "table domain map");
  const capabilityMap = readBoundJson(repositoryRoot, evidence.routineCapabilityMap, "routine capability map");
  const domain = tableMap.groups?.find(row => row.domain === evidence.domain);
  const capability = capabilityMap.domainEvidence?.[evidence.domain];
  if (!domain
    || domain.functionalStatus !== evidence.expectedFunctionalStatus
    || !evidence.requiredSourceTables.every(table => domain.sourceTables?.includes(table))
    || !object(capability)
    || !same(capability.targetServices, evidence.expectedTargetServices)
    || !same(capability.targetApis, evidence.expectedTargetApis)
    || !same(capability.targetPages, evidence.expectedTargetPages)) {
    fail("PE_GENPRICE_MODERN_TARGET_EVIDENCE_DRIFT", evidence.domain);
  }
  return { domain: evidence.domain, functionalStatus: domain.functionalStatus, serviceCount: 0, apiCount: 0, pageCount: 0 };
}

export function buildPayrollPeGenpriceEquivalenceGapReceipt({ contract, repositoryRoot }) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_payroll_pe_genprice_modern_equivalence_gap"
    || contract.sourceSystem !== "yuzhou-v10"
    || contract.behaviorEvidenceStatus !== "unverified"
    || contract.adapterDisposition !== "not_created_behavior_unverified"
    || contract.boundedSyntheticParityDisposition !== "not_run_source_oracle_unavailable"
    || !same(contract.blockingGaps, EXPECTED_GAPS)
    || !same(contract.forbiddenAssumptions, EXPECTED_ASSUMPTIONS)
    || contract.requiredDecision !== "KEEP_GAP"
    || contract.compatibilityCredit !== 0
    || contract.legacyRoutineExecuted !== false
    || contract.legacyDynamicSqlExecuted !== false
    || contract.containsPayrollValues !== false
    || contract.containsPersonalData !== false
    || contract.productionImport !== "HOLD") {
    fail("PE_GENPRICE_GAP_CONTRACT_INVALID", "identity or safety boundary");
  }
  const ledger = readBoundJson(repositoryRoot, contract.routineLedger, "routine ledger");
  validateSelection(contract, ledger);
  const routine = validateRoutine(contract, ledger);
  const sourceArtifact = validateManifest(contract, repositoryRoot);
  const businessPages = validateBusinessPages(contract, repositoryRoot);
  const modernTarget = validateModernTargetGap(contract, repositoryRoot);
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_payroll_pe_genprice_modern_equivalence_gap_receipt",
    routineId: contract.routineId,
    routineFamily: contract.routineFamily,
    selectionReason: "only_non_dynamic_unimplemented_payroll_routine_with_explicit_reads_write_joins_and_closed_calls",
    sourceArtifact,
    parameters: routine.parameters,
    readTableCount: routine.readTables.length,
    writeTableCount: routine.writeTables.length,
    joinPredicateCount: routine.joinPredicates.length,
    calledRoutineCount: routine.calledRoutines.length,
    businessPages,
    modernTarget,
    adapterCreated: false,
    boundedSyntheticParityRun: false,
    behaviorVerified: false,
    blockingGaps: [...contract.blockingGaps],
    decision: "KEEP_GAP",
    status: "BEST_STRUCTURAL_CANDIDATE_BEHAVIOR_AND_TARGET_UNAVAILABLE",
    compatibilityCredit: { numerator: 0, denominator: 1 },
    legacyRoutineExecuted: false,
    legacyDynamicSqlExecuted: false,
    containsPayrollValues: false,
    containsPersonalData: false,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(`${JSON.stringify(body)}\n`) };
}

function cli() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contractPath = resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-pe-genprice-modern-equivalence-gap-v1.json");
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  process.stdout.write(`${JSON.stringify(buildPayrollPeGenpriceEquivalenceGapReceipt({ contract, repositoryRoot }), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
