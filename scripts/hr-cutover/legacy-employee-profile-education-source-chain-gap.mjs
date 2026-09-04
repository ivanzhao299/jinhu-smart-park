#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED_SOURCE_FIELDS = ["person.edu", "person.secedu"];
const EXPECTED_GAPS = [
  "EDUCODE_DISPLAY_LABEL_PROJECTION_UNPROVEN",
  "SECEDU_EDU_PRECEDENCE_UNPROVEN",
  "LEGACY_PAGE_FIELD_BINDING_UNPROVEN",
];
const EXPECTED_FORBIDDEN_ASSUMPTIONS = [
  "educode_key_equals_display_label",
  "secedu_semantically_precedes_edu",
  "either_legacy_field_is_highest_education_without_reviewed_dictionary_projection",
];
const EXPECTED_ROUTINES = new Map([
  ["RULE-FDB8E6EFFBE4F692", ["u_personinfo2003", "adf140a230a553b28eca6558dcd324e7ac84fa58f821be23dab75af59437017a"]],
  ["RULE-E3B1314CFFD42847", ["web_personinfo_SelectCommand", "4785a80d7bdc5496c7d64d06567f3a51e3c4fd6aef1f7add7b43d3fc65410868"]],
]);

export class LegacyEmployeeProfileEducationSourceChainGapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyEmployeeProfileEducationSourceChainGapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyEmployeeProfileEducationSourceChainGapError(code, detail); };
const digest = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function readBoundFile(repositoryRoot, evidence, label) {
  if (!object(evidence) || typeof evidence.path !== "string" || !evidence.path || !SHA256.test(evidence.sha256 ?? "")) {
    fail("EMPLOYEE_EDUCATION_EVIDENCE_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, evidence.path));
  if (digest(bytes) !== evidence.sha256) fail("EMPLOYEE_EDUCATION_EVIDENCE_DRIFT", label);
  return bytes;
}

function assertTokens(source, tokens, label) {
  if (!Array.isArray(tokens) || !tokens.length || tokens.some(token => typeof token !== "string" || !token || !source.includes(token))) {
    fail("EMPLOYEE_EDUCATION_EVIDENCE_TOKEN_MISSING", label);
  }
}

function validateSourceRoutineEvidence(contract, repositoryRoot) {
  const evidence = contract.sourceRoutineEvidence;
  if (!object(evidence)
    || evidence.path !== "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json"
    || !same(evidence.requiredReadTables, ["educode", "person"])
    || evidence.requiredJoinPredicate !== "person.edu=educode.edu"
    || evidence.status !== "person_edu_dictionary_key_verified"
    || !Array.isArray(evidence.requiredRoutines)
    || evidence.requiredRoutines.length !== EXPECTED_ROUTINES.size) {
    fail("EMPLOYEE_EDUCATION_SOURCE_CONTRACT_INVALID", "routine evidence");
  }
  const ledger = JSON.parse(readBoundFile(repositoryRoot, evidence, "routine ledger"));
  if (!Array.isArray(ledger.routines) || ledger.productionImport !== "HOLD") {
    fail("EMPLOYEE_EDUCATION_SOURCE_LEDGER_INVALID", "routine ledger identity");
  }
  for (const required of evidence.requiredRoutines) {
    const expected = EXPECTED_ROUTINES.get(required.routineId);
    if (!expected || required.sourceName !== expected[0] || required.sourceArtifactSha256 !== expected[1]) {
      fail("EMPLOYEE_EDUCATION_SOURCE_CONTRACT_INVALID", String(required.routineId));
    }
    const routine = ledger.routines.find(row => row.routineId === required.routineId);
    if (!routine
      || routine.sourceName !== required.sourceName
      || routine.sourceArtifactSha256 !== required.sourceArtifactSha256
      || !evidence.requiredReadTables.every(table => routine.readTables?.includes(table))
      || !routine.joinPredicates?.includes(evidence.requiredJoinPredicate)
      || routine.statementProfile?.select !== 1
      || ["insert", "update", "delete", "merge", "alter"].some(operation => routine.statementProfile?.[operation] !== 0)
      || routine.writeTables?.length !== 0) {
      fail("EMPLOYEE_EDUCATION_SOURCE_ROUTINE_DRIFT", required.sourceName);
    }
  }
  return evidence.requiredRoutines.map(row => ({ routineId: row.routineId, sourceName: row.sourceName, sourceArtifactSha256: row.sourceArtifactSha256 }));
}

function validateLegacyPageEvidence(contract, repositoryRoot) {
  const evidence = contract.legacyPageEvidence;
  if (!object(evidence)
    || evidence.path !== "scripts/hr-cutover/contracts/legacy-client-live-traversal-v1.json"
    || evidence.familyId !== "employee_profile"
    || !same(evidence.requiredEntryPoints, ["档案维护", "档案查询"])
    || evidence.familyStatus !== "partial"
    || evidence.fieldBindingStatus !== "unproven") {
    fail("EMPLOYEE_EDUCATION_PAGE_CONTRACT_INVALID", "legacy page evidence");
  }
  const traversal = JSON.parse(readBoundFile(repositoryRoot, evidence, "legacy page traversal"));
  const family = traversal.menuFamilies?.find(row => row.id === evidence.familyId);
  if (!family
    || family.runtimeStatus !== evidence.familyStatus
    || !evidence.requiredEntryPoints.every(entry => family.entryPoints?.includes(entry))
    || family.reasonCode !== "PROFILE_SUBPAGES_PENDING") {
    fail("EMPLOYEE_EDUCATION_PAGE_EVIDENCE_DRIFT", evidence.familyId);
  }
  return { familyId: evidence.familyId, runtimeStatus: family.runtimeStatus, fieldBindingVerified: false };
}

function validateBoundSources(entries, repositoryRoot, label) {
  if (!Array.isArray(entries) || !entries.length) fail("EMPLOYEE_EDUCATION_EVIDENCE_INVALID", label);
  const seen = new Set();
  return entries.map(evidence => {
    if (!object(evidence) || typeof evidence.stage !== "string" && typeof evidence.surface !== "string") {
      fail("EMPLOYEE_EDUCATION_EVIDENCE_INVALID", label);
    }
    const identity = evidence.stage ?? evidence.surface;
    if (seen.has(identity)) fail("EMPLOYEE_EDUCATION_EVIDENCE_INVALID", `${label}:${identity}`);
    seen.add(identity);
    const source = readBoundFile(repositoryRoot, evidence, `${label}:${identity}`).toString("utf8");
    assertTokens(source, evidence.requiredTokens, `${label}:${identity}`);
    return { identity, path: evidence.path, sha256: evidence.sha256 };
  });
}

export function buildLegacyEmployeeProfileEducationSourceChainGapReceipt({ contract, repositoryRoot }) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_employee_profile_education_source_chain_gap"
    || contract.sourceSystem !== "yuzhou-v10"
    || contract.fieldFamily !== "education_attainment"
    || !same(contract.sourceFields, EXPECTED_SOURCE_FIELDS)
    || contract.intendedTargetField !== "hr_employee_profile.highest_education"
    || contract.observedTransform !== "trimmed_secedu_then_trimmed_edu_fallback"
    || contract.dictionaryProjectionStatus !== "unproven"
    || contract.precedenceStatus !== "unproven"
    || !same(contract.blockingGaps, EXPECTED_GAPS)
    || !same(contract.forbiddenAssumptions, EXPECTED_FORBIDDEN_ASSUMPTIONS)
    || contract.pipelineDisposition?.extract !== "read_only_person_core_residue_only_no_educode_projection"
    || contract.pipelineDisposition?.transform !== "existing_fallback_observed_not_semantically_promoted"
    || contract.pipelineDisposition?.privateStage !== "highest_education_shape_allowlisted"
    || contract.pipelineDisposition?.writer !== "highest_education_allowlisted_with_source_hashes"
    || contract.pipelineDisposition?.rollback !== "batch_scoped_active_legacy_record_map_target_only"
    || contract.receiptPolicy !== "aggregate_paths_hashes_object_ids_statuses_and_gap_codes_only"
    || contract.reviewStatus !== "gap"
    || contract.requiredDecision !== "KEEP_GAP"
    || contract.compatibilityCredit !== 0
    || contract.containsSourceValues !== false
    || contract.containsPersonalData !== false
    || !same(contract.filesExcluded, ["photo", "docs"])
    || contract.productionImport !== "HOLD") {
    fail("EMPLOYEE_EDUCATION_GAP_CONTRACT_INVALID", "identity or safety boundary");
  }

  const sourceRoutines = validateSourceRoutineEvidence(contract, repositoryRoot);
  const legacyPage = validateLegacyPageEvidence(contract, repositoryRoot);
  const pipeline = validateBoundSources(contract.pipelineEvidence, repositoryRoot, "pipeline");
  const modernSurfaces = validateBoundSources(contract.modernSurfaceEvidence, repositoryRoot, "modern surface");
  const expectedPipeline = ["reviewed_mapping", "read_only_extract", "transform", "private_stage", "writer_allowlist", "exact_rollback"];
  const expectedSurfaces = ["database_entity", "api_dto", "api_controller", "api_projection", "web_api", "web_ui"];
  if (!same(pipeline.map(row => row.identity), expectedPipeline)) fail("EMPLOYEE_EDUCATION_PIPELINE_COVERAGE_INVALID", "pipeline stages");
  if (!same(modernSurfaces.map(row => row.identity), expectedSurfaces)) fail("EMPLOYEE_EDUCATION_SURFACE_COVERAGE_INVALID", "modern surfaces");

  const extractor = readFileSync(resolve(repositoryRoot, contract.pipelineEvidence.find(row => row.stage === "read_only_extract").path), "utf8");
  if (/query educode\.raw\.json/u.test(extractor) || /educode\.raw\.json/u.test(extractor)) {
    fail("EMPLOYEE_EDUCATION_DICTIONARY_PROJECTION_STATUS_DRIFT", "educode extraction is now present and requires review");
  }

  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_employee_profile_education_source_chain_gap_receipt",
    fieldFamily: contract.fieldFamily,
    sourceFields: [...contract.sourceFields],
    intendedTargetField: contract.intendedTargetField,
    sourceRoutines,
    sourceDictionaryJoinVerified: true,
    legacyPage,
    observedTransform: contract.observedTransform,
    dictionaryProjectionVerified: false,
    precedenceVerified: false,
    privateStageShapeAllowlisted: true,
    writerFieldAllowlisted: true,
    exactRollbackBound: true,
    modernSurfaceCount: modernSurfaces.length,
    pipelineEvidenceCount: pipeline.length,
    blockingGaps: [...contract.blockingGaps],
    decision: "KEEP_GAP",
    status: "STRUCTURAL_CHAIN_BOUND_MATERIALIZATION_SEMANTICS_UNPROVEN",
    compatibilityCredit: { numerator: 0, denominator: 1 },
    containsSourceValues: false,
    containsPersonalData: false,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(`${JSON.stringify(body)}\n`) };
}

function cli() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contractPath = resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-employee-profile-education-source-chain-gap-v1.json");
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  process.stdout.write(`${JSON.stringify(buildLegacyEmployeeProfileEducationSourceChainGapReceipt({ contract, repositoryRoot }), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
