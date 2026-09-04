#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { computeRoutineLedgerSha256 } from "./legacy-routine-parity-contract.mjs";

export class LegacyPerformanceQueryRoutineParityError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyPerformanceQueryRoutineParityError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new LegacyPerformanceQueryRoutineParityError(code, detail);
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const HASH = /^[0-9a-f]{64}$/u;

const EXPECTED = [
  {
    routineId: "RULE-F3D80C57661321E9",
    sourceName: "u_assessmentquery",
    sourceArtifactSha256: "b83b5b63778842eca1a5e6ef98dbb352f2bc4a9cf25210b7f5e381c822e4d851",
    parameters: ["asssession:int", "department:varchar(30)", "name:varchar(10)", "gradelist:varchar(1024)", "itemvalue1:float", "itemvalue2:float"],
    outputCount: 6,
    semanticContractSha256: "6240bb3a1e90c77c89a6514fa7c072878994ee0f72036b4443296c82f07774f3",
    dynamic: true,
    missingColumns: [],
  },
  {
    routineId: "RULE-6092B6B0B15A0466",
    sourceName: "u_assessmentvalue",
    sourceArtifactSha256: "62f8586e560be1955380e79cfe1170beab5b0721f10ac6c54b470eaab5cea0fa",
    parameters: ["asssession:varchar(30)", "department:varchar(30)"],
    outputCount: 9,
    semanticContractSha256: "024cfd384499119695cea0ab4f6df474e058d67887ea1200217df2b79104edfc",
    modernStatus: "implemented_pending_runtime_uat",
    modernService: "HrPerformanceLegacyService.assessmentValueQuery",
    modernApi: "GET /hr/performance-legacy/query-reports/assessment-value",
    modernPage: "apps/web/app/hr/performance/HrPerformanceLegacyAssessmentValuePanel.tsx",
    dynamic: true,
    missingColumns: ["assessmentmaster.asssession", "assessmentmaster.grade"],
  },
  {
    routineId: "RULE-BED041EE4A468EC3",
    sourceName: "u_assessmentvalueofperson",
    sourceArtifactSha256: "bc1a1e92c3ede18394de57ed4cc9abe8cf8d734d88cd87755ecbb38829673c8e",
    parameters: ["person:varchar(10)"],
    outputCount: 8,
    semanticContractSha256: "f02adcd583d9862bf781d49aec2c4f3b9522bab5e7aa41693ac8f8d8c0958967",
    dynamic: true,
    missingColumns: ["assessmentmaster.asssession", "assessmentmaster.grade"],
  },
  {
    routineId: "RULE-0ACE2D87C1774B3B",
    sourceName: "u_assessmentmaster",
    sourceArtifactSha256: "edc82c9a342bbc9276b163f265002d04bd3e4c9f9f267fbab1009d26e2327946",
    parameters: ["asssession:varchar(30)", "assessmenttype:varchar(4)", "department:varchar(30)"],
    outputCount: 12,
    semanticContractSha256: "da51736c2069a1fd4a02378b232cd91f80dee55f4651bd526b880c3e4175c481",
    modernStatus: "implemented_pending_runtime_uat",
    modernService: "HrPerformanceLegacyService.assessmentMasterQuery",
    modernApi: "GET /hr/performance-legacy/query-reports/assessment-master",
    modernPage: "apps/web/app/hr/performance/HrPerformanceLegacyAssessmentMasterPanel.tsx",
    dynamic: false,
    missingColumns: ["assessmentmaster.assid", "assessmentmaster.asssession", "assessmentmaster.assessmenttype"],
  },
  {
    routineId: "RULE-58E6086521F8A03B",
    sourceName: "web_ass",
    sourceArtifactSha256: "0519e0941c405d98c76795cea378fe347a0dc7577fe9e79e68035761b3248933",
    parameters: ["person:varchar(10)"],
    outputCount: 6,
    semanticContractSha256: "ef4a9d7ebe7cde76a12cce7155d07d8e328aab58ab50856d794cc9a92110677c",
    modernStatus: "implemented_pending_runtime_uat",
    modernService: "HrPerformanceLegacyService.personSummary source_routine=web_ass",
    modernApi: "GET /hr/performance-legacy/query-reports/person-summary?source_routine=web_ass",
    modernPage: "apps/web/app/hr/performance/HrPerformanceLegacyPersonSummaryPanel.tsx",
    dynamic: false,
    missingColumns: [],
  },
  {
    routineId: "RULE-E6282105617A7A50",
    sourceName: "web_assessmentquery",
    sourceArtifactSha256: "2ccc23b92971ea34dffb3e4cd6ef190b57e79192a38dc97900d434995ac88674",
    parameters: ["person:varchar(10)"],
    outputCount: 6,
    semanticContractSha256: "64a5f0f613cb385829a474390d7f940500bb8ccef79385b3c716baef69ec1572",
    modernStatus: "implemented_pending_runtime_uat",
    modernService: "HrPerformanceLegacyService.personSummary source_routine=web_assessmentquery",
    modernApi: "GET /hr/performance-legacy/query-reports/person-summary?source_routine=web_assessmentquery",
    modernPage: "apps/web/app/hr/performance/HrPerformanceLegacyPersonSummaryPanel.tsx",
    dynamic: true,
    missingColumns: [],
  },
  {
    routineId: "RULE-0C4458064CE74646",
    sourceName: "web_assquery",
    sourceArtifactSha256: "1c828ea8c8afec8238a5e2f35c59cb6d4b97c30305167e4805b82f0722afb27e",
    parameters: ["person:varchar(30)", "asssession:varchar(30)", "itemvalue1:float", "itemvalue2:float", "rightscope:varchar(31)"],
    outputCount: 6,
    semanticContractSha256: "08a3a7c7757d787aa5f37b5fd3db79bf56a6585ea85fe1ebd194f17f2c042c3b",
    dynamic: true,
    missingColumns: ["assessmentmaster.asssession"],
  },
];

const DYNAMIC_IDS = new Set(EXPECTED.filter(row => row.dynamic).map(row => row.routineId));
const REQUIRED_REPLACEMENT_CODES = [
  "TENANT_PARK_BOUND_PARAMETER",
  "SERVER_DERIVED_PERFORMANCE_SCOPE",
  "PARAMETERIZED_QUERY_ONLY",
  "GRADE_LIST_TYPED_ALLOWLIST",
  "REQUIRED_SENSITIVE_READ_AUDIT",
  "HISTORICAL_RESULT_PROJECTION",
  "SOURCE_PAY_NOT_IN_QUERY_FAMILY",
];

function repositoryFile(repositoryRoot, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.startsWith("/")) {
    fail("PERFORMANCE_QUERY_PATH_INVALID", String(relativePath));
  }
  const root = realpathSync(repositoryRoot);
  const candidate = realpathSync(resolve(root, relativePath));
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    fail("PERFORMANCE_QUERY_PATH_INVALID", relativePath);
  }
  return candidate;
}

function readJson(repositoryRoot, relativePath) {
  return JSON.parse(readFileSync(repositoryFile(repositoryRoot, relativePath), "utf8"));
}

function assertNonEmpty(value, code, detail) {
  if (typeof value !== "string" || !value.trim()) fail(code, detail);
}

function reviewedLedger(contract, sourceLedger) {
  const adjudications = contract.sourceReview?.dynamicSqlAdjudications;
  if (!Array.isArray(adjudications) || adjudications.length !== DYNAMIC_IDS.size) {
    fail("PERFORMANCE_QUERY_DYNAMIC_REVIEW_INVALID", "count");
  }
  const adjudicationById = new Map(adjudications.map(row => [row.routineId, row]));
  if (adjudicationById.size !== adjudications.length) fail("PERFORMANCE_QUERY_DYNAMIC_REVIEW_INVALID", "duplicates");

  return {
    routines: EXPECTED.map(expected => {
      const source = sourceLedger.routines.find(row => row.routineId === expected.routineId);
      if (!source) fail("PERFORMANCE_QUERY_SOURCE_MISSING", expected.sourceName);
      const sourceParameters = source.parameters.map(row => `${row.name}:${row.sourceType}`);
      if (
        source.sourceName !== expected.sourceName
        || source.canonicalFamily !== expected.sourceName
        || source.sourceArtifactSha256 !== expected.sourceArtifactSha256
        || !same(sourceParameters, expected.parameters)
        || !same(source.readTables, ["assessmentmaster", "person"])
        || source.writeTables.length !== 0
        || source.dynamicWriteTables.length !== 0
        || ["insert", "update", "delete", "merge", "alter"]
          .some(statement => source.statementProfile?.[statement] !== 0)
      ) {
        fail("PERFORMANCE_QUERY_SOURCE_PROFILE_DRIFT", expected.sourceName);
      }
      if (expected.dynamic) {
        const review = adjudicationById.get(expected.routineId);
        if (
          source.dynamicMutationStatus !== "unknown_requires_review"
          || !source.logicSignals.includes("dynamic_sql")
          || review?.from !== "unknown_requires_review"
          || review.to !== "none"
          || review.reviewedCapability !== "read_only_dynamic_projection"
        ) fail("PERFORMANCE_QUERY_DYNAMIC_REVIEW_INVALID", expected.sourceName);
        return {
          ...source,
          sourceSurface: contract.sourceBinding.sourceSurface,
          dynamicMutationStatus: "none",
          businessCapability: "read_only_dynamic_projection",
          classificationEvidence: "source-routine-semantic-review",
        };
      }
      if (source.dynamicMutationStatus !== "none" || source.logicSignals.includes("dynamic_sql")) {
        fail("PERFORMANCE_QUERY_SOURCE_PROFILE_DRIFT", `${expected.sourceName}:dynamic`);
      }
      return { ...source, sourceSurface: contract.sourceBinding.sourceSurface };
    }),
  };
}

function validateSourceBindings(contract, repositoryRoot) {
  const binding = contract.sourceBinding;
  if (
    binding?.sourceRoutineCount !== EXPECTED.length
    || binding.sourceSurface !== "yuzhou_v10_client_database"
    || !HASH.test(binding.routineLedgerFileSha256 ?? "")
    || !HASH.test(binding.reviewedRoutineSubsetSha256 ?? "")
    || !HASH.test(binding.schemaManifestFileSha256 ?? "")
    || !HASH.test(binding.schemaArtifactSha256 ?? "")
  ) fail("PERFORMANCE_QUERY_SOURCE_BINDING_INVALID", "root");

  const ledgerFile = repositoryFile(repositoryRoot, binding.routineLedgerPath);
  if (sha256(readFileSync(ledgerFile)) !== binding.routineLedgerFileSha256) {
    fail("PERFORMANCE_QUERY_SOURCE_LEDGER_DRIFT", binding.routineLedgerPath);
  }
  const sourceLedger = JSON.parse(readFileSync(ledgerFile, "utf8"));
  const subset = reviewedLedger(contract, sourceLedger);
  if (computeRoutineLedgerSha256(subset) !== binding.reviewedRoutineSubsetSha256) {
    fail("PERFORMANCE_QUERY_SOURCE_SUBSET_DRIFT", "reviewed routines");
  }

  const manifestFile = repositoryFile(repositoryRoot, binding.schemaManifestPath);
  if (sha256(readFileSync(manifestFile)) !== binding.schemaManifestFileSha256) {
    fail("PERFORMANCE_QUERY_SCHEMA_MANIFEST_DRIFT", binding.schemaManifestPath);
  }
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const schemaEntries = manifest.files?.filter(row => row.path === binding.schemaArtifactPath) ?? [];
  if (schemaEntries.length !== 1 || schemaEntries[0].sha256 !== binding.schemaArtifactSha256) {
    fail("PERFORMANCE_QUERY_SCHEMA_BINDING_INVALID", binding.schemaArtifactPath);
  }

  const expectedColumns = [
    "id", "asssessionid", "person", "selfgrade", "assgrade", "selfvalue", "itemvalue",
    "mitemvalue", "xitemvalue", "citemvalue", "mastervalue", "timekeepvalue", "bonusvalue",
    "totalvalue", "selfappraisal", "appraisal", "pay", "assessmentperson", "recdate", "operator", "des",
  ];
  if (!same(binding.assessmentMasterColumns, expectedColumns)) {
    fail("PERFORMANCE_QUERY_ASSESSMENTMASTER_SHAPE_DRIFT", "columns");
  }
}

function validateOutputColumns(row, expected) {
  if (!Array.isArray(row.outputColumns) || row.outputColumns.length !== expected.outputCount) {
    fail("PERFORMANCE_QUERY_OUTPUT_INVALID", `${row.sourceName}:count`);
  }
  const expressions = new Set();
  for (const [index, column] of row.outputColumns.entries()) {
    if (column.ordinal !== index + 1) fail("PERFORMANCE_QUERY_OUTPUT_INVALID", `${row.sourceName}:ordinal`);
    for (const field of ["sourceExpression", "sourceAlias", "plannedModernField"]) {
      assertNonEmpty(column[field], "PERFORMANCE_QUERY_OUTPUT_INVALID", `${row.sourceName}:${field}`);
    }
    if (expressions.has(column.sourceExpression)) fail("PERFORMANCE_QUERY_OUTPUT_INVALID", `${row.sourceName}:duplicate`);
    expressions.add(column.sourceExpression);
  }
  if (row.outputColumns.some(column => /assessmentmaster\.pay$/iu.test(column.sourceExpression))) {
    fail("PERFORMANCE_QUERY_PAY_FIELD_FORBIDDEN", row.sourceName);
  }
}

function semanticContractSha256(row) {
  return sha256(JSON.stringify({
    parameters: row.parameters,
    joinSemantics: row.joinSemantics,
    filters: row.filters,
    outputColumns: row.outputColumns,
    calculationSemantics: row.calculationSemantics,
    legacyDynamicSql: row.legacyDynamicSql,
    knownDifferences: row.knownDifferences,
    sourceSchemaStatus: row.sourceSchemaStatus,
    missingSourceColumns: row.missingSourceColumns,
    modernTarget: row.modernTarget,
    implementationEvidence: row.implementationEvidence,
    missingEvidence: row.missingEvidence,
  }));
}

function validateRoutineRows(contract, repositoryRoot) {
  if (!Array.isArray(contract.routines) || contract.routines.length !== EXPECTED.length) {
    fail("PERFORMANCE_QUERY_ROUTINE_SCOPE_INVALID", "count");
  }
  if (!same(contract.routines.map(row => row.routineId), EXPECTED.map(row => row.routineId))) {
    fail("PERFORMANCE_QUERY_ROUTINE_SCOPE_INVALID", "identity/order");
  }

  for (const [index, row] of contract.routines.entries()) {
    const expected = EXPECTED[index];
    if (
      row.sourceName !== expected.sourceName
      || row.canonicalFamily !== expected.sourceName
      || row.sourceArtifactSha256 !== expected.sourceArtifactSha256
      || row.parityStatus !== "pending"
      || row.compatibilityCredit !== 0
    ) fail("PERFORMANCE_QUERY_ROUTINE_IDENTITY_INVALID", expected.sourceName);

    if (!same(row.parameters.map(parameter => `${parameter.name}:${parameter.sourceType}`), expected.parameters)) {
      fail("PERFORMANCE_QUERY_PARAMETER_DRIFT", expected.sourceName);
    }
    row.parameters.forEach(parameter => assertNonEmpty(parameter.behavior, "PERFORMANCE_QUERY_PARAMETER_INVALID", expected.sourceName));
    assertNonEmpty(row.joinSemantics, "PERFORMANCE_QUERY_JOIN_INVALID", expected.sourceName);
    if (!Array.isArray(row.filters) || !row.filters.length) fail("PERFORMANCE_QUERY_FILTER_INVALID", expected.sourceName);
    row.filters.forEach(filter => {
      assertNonEmpty(filter.sourceExpression, "PERFORMANCE_QUERY_FILTER_INVALID", expected.sourceName);
      assertNonEmpty(filter.behavior, "PERFORMANCE_QUERY_FILTER_INVALID", expected.sourceName);
    });
    validateOutputColumns(row, expected);

    const dynamic = row.legacyDynamicSql;
    if (
      dynamic?.mutation !== "none"
      || !Array.isArray(dynamic.concatenatedParameters)
      || !/\bbind(?:s|ing|ed)?\b|\bbound\b/iu.test(dynamic.safeReplacement ?? "")
    ) fail("PERFORMANCE_QUERY_DYNAMIC_CONTRACT_INVALID", expected.sourceName);
    if (expected.dynamic) {
      if (dynamic.mode !== "raw_input_concatenation" || !dynamic.concatenatedParameters.length || !dynamic.risk.includes("injection")) {
        fail("PERFORMANCE_QUERY_DYNAMIC_CONTRACT_INVALID", expected.sourceName);
      }
    } else if (dynamic.mode !== "static_parameter_binding" || dynamic.concatenatedParameters.length) {
      fail("PERFORMANCE_QUERY_DYNAMIC_CONTRACT_INVALID", expected.sourceName);
    }

    const expectedSchemaStatus = expected.missingColumns.length ? "dormant_schema_drift" : "compatible";
    if (row.sourceSchemaStatus !== expectedSchemaStatus || !same(row.missingSourceColumns, expected.missingColumns)) {
      fail("PERFORMANCE_QUERY_SCHEMA_DRIFT_CLASSIFICATION_INVALID", expected.sourceName);
    }
    if (
      row.modernTarget?.status !== (expected.modernStatus ?? "not_implemented")
      || !Array.isArray(row.missingEvidence)
      || row.missingEvidence.length < 4
      || !Array.isArray(row.knownDifferences)
      || !row.knownDifferences.length
    ) fail("PERFORMANCE_QUERY_PENDING_EVIDENCE_INVALID", expected.sourceName);

    if (expected.modernStatus) {
      if (
        row.modernTarget.serviceSymbol !== expected.modernService
        || row.modernTarget.api !== expected.modernApi
        || row.modernTarget.page !== expected.modernPage
        || !Array.isArray(row.implementationEvidence)
        || row.implementationEvidence.length !== 2
      ) fail("PERFORMANCE_QUERY_IMPLEMENTATION_EVIDENCE_INVALID", expected.sourceName);
      for (const evidence of row.implementationEvidence) {
        assertNonEmpty(evidence.path, "PERFORMANCE_QUERY_IMPLEMENTATION_EVIDENCE_INVALID", expected.sourceName);
        assertNonEmpty(evidence.testId, "PERFORMANCE_QUERY_IMPLEMENTATION_EVIDENCE_INVALID", expected.sourceName);
        const evidenceText = readFileSync(repositoryFile(repositoryRoot, evidence.path), "utf8");
        if (!evidenceText.includes(`test("${evidence.testId}"`)) {
          fail("PERFORMANCE_QUERY_IMPLEMENTATION_EVIDENCE_INVALID", `${expected.sourceName}:${evidence.testId}`);
        }
      }
    } else if (row.implementationEvidence !== undefined) {
      fail("PERFORMANCE_QUERY_IMPLEMENTATION_EVIDENCE_INVALID", expected.sourceName);
    }

    if (semanticContractSha256(row) !== expected.semanticContractSha256) {
      fail("PERFORMANCE_QUERY_SEMANTIC_CONTRACT_DRIFT", expected.sourceName);
    }
  }
}

function validateKnownDifferences(contract) {
  const byName = new Map(contract.routines.map(row => [row.sourceName, row]));
  for (const name of ["u_assessmentvalue", "u_assessmentvalueofperson"]) {
    const row = byName.get(name);
    const calculation = row.calculationSemantics?.find(item => item.code === "LEGACY_FINAL_EXCLUDES_MASTERVALUE");
    if (
      calculation?.expression !== "itemvalue + timekeepvalue + bonusvalue"
      || !calculation.difference.includes("not included")
      || !row.knownDifferences.some(item => item.code === "LEGACY_FINAL_EXCLUDES_MASTERVALUE")
    ) fail("PERFORMANCE_QUERY_MASTER_VALUE_DIFFERENCE_MISSING", name);
  }

  const webQuery = byName.get("web_assquery");
  const session = webQuery.parameters.find(parameter => parameter.name === "asssession");
  if (
    !session?.behavior.includes("ignored")
    || !same(webQuery.legacyDynamicSql.discardedParameters, ["asssession"])
    || !webQuery.knownDifferences.some(item => item.code === "LEGACY_SESSION_PARAMETER_DISCARDED")
    || !webQuery.filters.some(item => item.sourceExpression === "assessmentmaster.asssession LIKE '%'")
  ) fail("PERFORMANCE_QUERY_IGNORED_SESSION_DIFFERENCE_MISSING", "web_assquery");

  const assessmentQuery = byName.get("u_assessmentquery");
  if (!assessmentQuery.knownDifferences.some(item => item.code === "RAW_GRADE_LIST_DYNAMIC_SQL")) {
    fail("PERFORMANCE_QUERY_GRADE_LIST_RISK_MISSING", "u_assessmentquery");
  }
  const assessmentMaster = byName.get("u_assessmentmaster");
  if (!assessmentMaster.knownDifferences.some(item => item.code === "CALLER_SUPPLIED_LIKE_PATTERN")) {
    fail("PERFORMANCE_QUERY_LIKE_PATTERN_DIFFERENCE_MISSING", "u_assessmentmaster");
  }

  const outputIdentity = row => row.outputColumns.map(column => `${column.sourceExpression}|${column.sourceAlias}`);
  if (!same(outputIdentity(byName.get("web_ass")), outputIdentity(byName.get("web_assessmentquery")))) {
    fail("PERFORMANCE_QUERY_WEB_DUPLICATE_OUTPUT_DRIFT", "web_ass/web_assessmentquery");
  }
  if (
    !byName.get("web_ass").knownDifferences.some(item => item.code === "ORPHAN_MASTER_EXCLUDED")
    || !byName.get("web_assessmentquery").knownDifferences
      .some(item => item.code === "ORPHAN_MASTER_PRESERVED")
  ) fail("PERFORMANCE_QUERY_WEB_ORPHAN_POLICY_MISSING", "web_ass/web_assessmentquery");
}

function validateCompletionBoundary(contract) {
  const codes = contract.sharedModernReplacementRequirements?.map(row => row.code);
  if (!same(codes, REQUIRED_REPLACEMENT_CODES)) fail("PERFORMANCE_QUERY_SECURITY_REQUIREMENTS_INVALID", "codes");
  contract.sharedModernReplacementRequirements.forEach(row => assertNonEmpty(row.requirement, "PERFORMANCE_QUERY_SECURITY_REQUIREMENTS_INVALID", row.code));
  if (
    contract.completionPolicy?.currentStatus !== "IN_PROGRESS"
    || contract.completionPolicy.verifiedRoutineCount !== 0
    || contract.completionPolicy.pendingRoutineCount !== EXPECTED.length
    || contract.nonClaims?.compatibilityScoreIncrease !== "ZERO"
    || contract.nonClaims?.semanticInventoryIsFunctionalParity !== "NOT_CLAIMED"
    || contract.nonClaims?.productionImport !== "NOT_AUTHORIZED_BY_THIS_CONTRACT"
    || contract.productionImport !== "HOLD"
  ) fail("PERFORMANCE_QUERY_COMPLETION_BOUNDARY_INVALID", "root");
}

export function verifyLegacyPerformanceQueryRoutineParity({ contract, repositoryRoot }) {
  if (
    contract?.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_performance_query_routine_parity"
    || contract.contractVersion !== "1.0.0"
  ) fail("PERFORMANCE_QUERY_CONTRACT_IDENTITY_INVALID", "root");

  validateSourceBindings(contract, repositoryRoot);
  validateRoutineRows(contract, repositoryRoot);
  validateKnownDifferences(contract);
  validateCompletionBoundary(contract);

  return {
    ok: true,
    status: "IN_PROGRESS",
    sourceRoutines: EXPECTED.length,
    verifiedRoutines: 0,
    pendingRoutines: EXPECTED.length,
    implementedTargets: 4,
    dynamicReadOnlyRoutines: DYNAMIC_IDS.size,
    schemaDriftRoutines: EXPECTED.filter(row => row.missingColumns.length).length,
    compatibilityCredit: 0,
    containsSourceRows: false,
    containsPersonalData: false,
    productionImport: "HOLD",
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const repositoryRoot = resolve(import.meta.dirname, "../..");
    const contract = readJson(repositoryRoot, "scripts/hr-cutover/contracts/legacy-performance-query-routine-parity-v1.json");
    process.stdout.write(`${JSON.stringify(verifyLegacyPerformanceQueryRoutineParity({ contract, repositoryRoot }), null, 2)}\n`);
  } catch (error) {
    const code = error instanceof LegacyPerformanceQueryRoutineParityError
      ? error.code
      : "PERFORMANCE_QUERY_ROUTINE_PARITY_FAILED";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
