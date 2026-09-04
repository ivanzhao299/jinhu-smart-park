#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED_BINDINGS = {
  routineLedger: "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json",
  uErrandrecordsMapping: "scripts/hr-cutover/contracts/legacy-u-errandrecords-modern-map-v1.json",
  uErrandrecordsParity: "scripts/hr-cutover/contracts/legacy-u-errandrecords-parity-v1.json",
  bsReadfromleaveMapping: "scripts/hr-cutover/contracts/legacy-bs-readfromleave-modern-map-v1.json",
  bsReadfromleaveParity: "scripts/hr-cutover/contracts/legacy-bs-readfromleave-parity-v1.json",
  uErrandrecordsSourceReceiptImplementation: "scripts/hr-cutover/u-errandrecords-source-receipt.mjs",
};
const EXPECTED_FAMILIES = {
  u_errandrecords: {
    routineId: "RULE-89960D3A0FC9C591",
    sourceArtifactSha256: "843efe8aa268d7f06ca21ccf8f3892854876f3bbf5bdd6d05e0c3eea4a778f6a",
    businessReadTables: ["departmentcode", "errand", "person"],
    businessWriteTables: [],
    modernRequestType: "business_trip",
    parityStatus: "pending",
    sourceDataEvidenceStatus: "safe_receipt_implementation_only_current_receipt_not_bound",
  },
  bs_readfromLeave: {
    routineId: "RULE-A6D7E11BA9DEAEC2",
    sourceArtifactSha256: "dee344b19687b45a4a34640568ec9239e69de16c3640eb666260b62660dd0a6a",
    businessReadTables: ["leave", "timekeeprecord"],
    businessWriteTables: ["timekeeprecord"],
    modernRequestType: "leave",
    parityStatus: "verified",
    sourceDataEvidenceStatus: "empty_fixture_only",
  },
};
const EXPECTED_GAPS = [
  "ERRAND_LEAVE_SHARED_SOURCE_RELATION_UNPROVEN",
  "ERRAND_CURRENT_SAFE_SOURCE_RECEIPT_NOT_BOUND",
  "LEAVE_SOURCE_DATA_STATE_EMPTY_FIXTURE_ONLY",
];

export class LegacyAttendanceSourceRelationshipGapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyAttendanceSourceRelationshipGapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyAttendanceSourceRelationshipGapError(code, detail); };
const digest = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const sorted = values => [...values].sort((a, b) => a.localeCompare(b, "en"));

function readBinding(repositoryRoot, binding, key) {
  if (!object(binding) || binding.path !== EXPECTED_BINDINGS[key] || !SHA256.test(binding.sha256 ?? "")) {
    fail("ATTENDANCE_SOURCE_RELATIONSHIP_BINDING_INVALID", key);
  }
  const bytes = readFileSync(resolve(repositoryRoot, binding.path));
  if (digest(bytes) !== binding.sha256) fail("ATTENDANCE_SOURCE_RELATIONSHIP_EVIDENCE_DRIFT", key);
  return bytes;
}

function assertFamilyContract(family) {
  const expected = EXPECTED_FAMILIES[family?.canonicalFamily];
  if (!object(family)
    || !expected
    || family.routineId !== expected.routineId
    || family.sourceArtifactSha256 !== expected.sourceArtifactSha256
    || !same(family.businessReadTables, expected.businessReadTables)
    || !same(family.businessWriteTables, expected.businessWriteTables)
    || !same(family.calledRoutines, [])
    || family.modernRequestType !== expected.modernRequestType
    || family.parityStatus !== expected.parityStatus
    || family.sourceDataEvidenceStatus !== expected.sourceDataEvidenceStatus) {
    fail("ATTENDANCE_SOURCE_RELATIONSHIP_FAMILY_INVALID", String(family?.canonicalFamily));
  }
}

export function buildLegacyAttendanceSourceRelationshipGapReceipt({ contract, repositoryRoot }) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_bs_readfromleave_u_errandrecords_source_relationship_gap"
    || contract.scope !== "legacy_business_trip_and_leave_source_relationship"
    || contract.decision !== "KEEP_SEPARATE_AND_PENDING"
    || contract.compatibilityCredit !== 0
    || contract.receiptPolicy !== "aggregate_object_identities_hashes_relationship_statuses_and_gap_codes_only"
    || contract.containsSourceRows !== false
    || contract.containsPersonalData !== false
    || contract.productionImport !== "HOLD"
    || !same(contract.gapCodes, EXPECTED_GAPS)) {
    fail("ATTENDANCE_SOURCE_RELATIONSHIP_CONTRACT_INVALID", "identity or safety boundary");
  }
  if (!Array.isArray(contract.families)
    || contract.families.length !== 2
    || !same(sorted(contract.families.map(row => row.canonicalFamily)), sorted(Object.keys(EXPECTED_FAMILIES)))) {
    fail("ATTENDANCE_SOURCE_RELATIONSHIP_FAMILY_COVERAGE_INVALID", "exact two-family scope required");
  }
  for (const family of contract.families) assertFamilyContract(family);
  if (!object(contract.evidenceBindings)
    || !same(sorted(Object.keys(contract.evidenceBindings)), sorted(Object.keys(EXPECTED_BINDINGS)))) {
    fail("ATTENDANCE_SOURCE_RELATIONSHIP_BINDING_INVALID", "binding coverage");
  }
  if (!object(contract.relationshipEvidence)
    || !same(contract.relationshipEvidence.sharedSourceBusinessTables, [])
    || !same(contract.relationshipEvidence.directRoutineCalls, [])
    || contract.relationshipEvidence.sharedSourceKeyEvidence !== "missing"
    || contract.relationshipEvidence.declaredForeignKeyEvidence !== "missing"
    || contract.relationshipEvidence.crossFamilyRowReceipt !== "missing"
    || contract.relationshipEvidence.sourceRowIdentityInterchangeable !== false
    || contract.relationshipEvidence.allowedInference !== "NONE") {
    fail("ATTENDANCE_SOURCE_RELATIONSHIP_PROMOTION_UNPROVEN", "relationship evidence");
  }

  const evidence = Object.fromEntries(Object.entries(contract.evidenceBindings).map(([key, binding]) => [key, readBinding(repositoryRoot, binding, key)]));
  const ledger = JSON.parse(evidence.routineLedger.toString("utf8"));
  const errandMap = JSON.parse(evidence.uErrandrecordsMapping.toString("utf8"));
  const errandParity = JSON.parse(evidence.uErrandrecordsParity.toString("utf8"));
  const leaveMap = JSON.parse(evidence.bsReadfromleaveMapping.toString("utf8"));
  const leaveParity = JSON.parse(evidence.bsReadfromleaveParity.toString("utf8"));

  for (const family of contract.families) {
    const expected = EXPECTED_FAMILIES[family.canonicalFamily];
    const routine = ledger.routines?.find(row => row.routineId === expected.routineId);
    if (!routine
      || routine.canonicalFamily !== family.canonicalFamily
      || routine.sourceArtifactSha256 !== expected.sourceArtifactSha256
      || !same(routine.calledRoutines, [])
      || !same(routine.writeTables, expected.businessWriteTables)) {
      fail("ATTENDANCE_SOURCE_RELATIONSHIP_LEDGER_DRIFT", family.canonicalFamily);
    }
    const generated = family.canonicalFamily === "bs_readfromLeave" ? leaveMap.sourceContract.generatedObjects : [];
    const businessReads = routine.readTables.filter(table => !generated.includes(table));
    if (!same(businessReads, expected.businessReadTables)) fail("ATTENDANCE_SOURCE_RELATIONSHIP_LEDGER_DRIFT", `${family.canonicalFamily}:read tables`);
  }

  const errandRow = errandParity.routines?.[0];
  const leaveRow = leaveParity.routines?.[0];
  if (errandMap.canonicalFamily !== "u_errandrecords"
    || errandMap.modernContract?.requestType !== "business_trip"
    || !errandMap.modernContract?.unresolvedSemantics?.includes("source_data_state_not_bound_to_a_current_safe_count_receipt")
    || errandRow?.parityStatus !== "pending"
    || errandRow?.review?.status !== "pending") {
    fail("ATTENDANCE_SOURCE_RELATIONSHIP_ERRAND_STATUS_DRIFT", "u_errandrecords");
  }
  if (leaveMap.canonicalFamily !== "bs_readfromLeave"
    || leaveMap.modernContract?.requestType !== "leave"
    || leaveRow?.parityStatus !== "verified"
    || leaveRow?.review?.status !== "approved"
    || leaveRow?.semantics?.dormantPaths?.sourceDataState !== "empty") {
    fail("ATTENDANCE_SOURCE_RELATIONSHIP_LEAVE_STATUS_DRIFT", "bs_readfromLeave");
  }
  const receiptImplementation = evidence.uErrandrecordsSourceReceiptImplementation.toString("utf8");
  for (const token of ["U_ERRANDRECORDS_SAFE_AGGREGATE_SQL", "read_only_aggregate", "productionImport: \"HOLD\""]) {
    if (!receiptImplementation.includes(token)) fail("ATTENDANCE_SOURCE_RELATIONSHIP_RECEIPT_IMPLEMENTATION_DRIFT", token);
  }

  const families = contract.families.map(family => ({
    canonicalFamily: family.canonicalFamily,
    routineId: family.routineId,
    sourceArtifactSha256: family.sourceArtifactSha256,
    businessReadTables: [...family.businessReadTables],
    businessWriteTables: [...family.businessWriteTables],
    modernRequestType: family.modernRequestType,
    parityStatus: family.parityStatus,
    sourceDataEvidenceStatus: family.sourceDataEvidenceStatus,
  }));
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_attendance_source_relationship_gap_receipt",
    scope: contract.scope,
    routineLedgerSha256: contract.evidenceBindings.routineLedger.sha256,
    families,
    sharedSourceBusinessTables: [],
    directRoutineCalls: [],
    sourceRowIdentityInterchangeable: false,
    allowedInference: "NONE",
    decision: "KEEP_SEPARATE_AND_PENDING",
    gapCodes: [...EXPECTED_GAPS],
    status: "SOURCE_RELATIONSHIP_EVIDENCE_MISSING",
    compatibilityCredit: { numerator: 0, denominator: 1 },
    containsSourceRows: false,
    containsPersonalData: false,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(`${JSON.stringify(body)}\n`) };
}

function cli() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-bs-readfromleave-u-errandrecords-relationship-gap-v1.json"), "utf8"));
  process.stdout.write(`${JSON.stringify(buildLegacyAttendanceSourceRelationshipGapReceipt({ contract, repositoryRoot }), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
