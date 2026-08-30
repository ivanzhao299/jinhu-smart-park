#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA256 = /^[0-9a-f]{64}$/;
const REQUIRED_COUNTS = Object.freeze({
  salaryActualRowCount: 46092,
  itemDefinitions: 711,
  formulaDefinitions: 244,
  closeRecords: 1431,
  schemeMemberships: 647,
  taxRules: 9,
});
const REQUIRED_ROLES = ["hr", "payroll", "finance"];
const REQUIRED_CANDIDATE = Object.freeze({
  periodStart: "2024-01-01",
  periodEnd: "2026-12-31",
  fullSourceRows: 46092,
  candidateRows: 8342,
  candidateLoadedRows: 8342,
  candidateQuarantinedRows: 0,
  candidateSnapshotItems: 190880,
  candidateCloseRecords: 266,
  candidateSourceNet: "15723009.9100",
  candidateLoadedNet: "15723009.9100",
  coldArchiveRows: 37750,
  coldArchiveDisposition: "deferred",
});

const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
    : JSON.stringify(value);

const readJson = (path) => JSON.parse(readFileSync(resolve(path), "utf8"));

export function compileT4Readiness(sourceEvidence, businessInputs) {
  const reasons = [];
  const extraction = sourceEvidence?.pendingExtractionEvidence;
  if (extraction?.status !== "completed" || extraction.doubleExtractMatched !== true) {
    reasons.push("T4_EXTRACTION_INCOMPLETE");
  }
  if (!SHA256.test(extraction?.businessContentSha256 ?? "")) reasons.push("T4_EXTRACTION_HASH_INVALID");
  for (const [field, count] of Object.entries(REQUIRED_COUNTS)) {
    if (sourceEvidence?.payrollProfile?.[field] !== count) reasons.push("T4_SOURCE_PROFILE_DRIFT");
  }
  if (sourceEvidence?.payrollProfile?.period?.minimumYear !== 2010 || sourceEvidence?.payrollProfile?.period?.maximumYear !== 2026) reasons.push("T4_SOURCE_PERIOD_DRIFT");
  const candidate = sourceEvidence?.productionCandidate;
  if (Object.entries(REQUIRED_CANDIDATE).some(([field, expected]) => candidate?.[field] !== expected)
    || candidate?.sourceSystemRetired !== true
    || candidate?.incrementalDeltaRequired !== false
    || candidate?.candidateRows !== candidate?.candidateLoadedRows + candidate?.candidateQuarantinedRows
    || candidate?.fullSourceRows !== candidate?.candidateRows + candidate?.coldArchiveRows) {
    reasons.push("T4_CANDIDATE_PROFILE_DRIFT");
  }
  if (extraction?.sourceProof?.readOnly !== true
    || extraction?.sourceProof?.etlSa !== false
    || extraction?.sourceProof?.etlSysadmin !== false
    || extraction?.sourceProof?.dbDataReader !== true
    || extraction?.sourceProof?.viewDefinition !== true
    || extraction?.sourceProof?.credentialFileMode !== "0600") {
    reasons.push("T4_SOURCE_AUTHORITY_INVALID");
  }
  const formulaApproval = businessInputs?.formulaApproval;
  if (!formulaApproval || formulaApproval.status !== "approved_for_simulation" || !Array.isArray(formulaApproval.formulaVersionIds) || formulaApproval.formulaVersionIds.length === 0 || !SHA256.test(formulaApproval.artifactSha256 ?? "")) {
    reasons.push("T4_FORMULA_SCOPE_UNSIGNED");
  }
  const policies = businessInputs?.tolerancePolicies;
  if (!Array.isArray(policies) || policies.length === 0 || policies.some((policy) => !SHA256.test(policy?.artifactSha256 ?? "") || typeof policy?.toleranceDecimal !== "string" || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$/.test(policy.toleranceDecimal))) {
    reasons.push("T4_TOLERANCE_UNSIGNED");
  }
  const attestations = Array.isArray(businessInputs?.attestations) ? businessInputs.attestations : [];
  const accepted = attestations.filter((item) => item?.decision === "accepted"
    && REQUIRED_ROLES.includes(item?.role)
    && item?.subjectManifestSha256 === extraction?.businessContentSha256
    && SHA256.test(item?.artifactSha256 ?? "")
    && SHA256.test(item?.signerSubjectId ?? ""));
  const byRole = new Map(accepted.map((item) => [item.role, item]));
  const subjects = new Set(accepted.map((item) => item.signerSubjectId));
  if (REQUIRED_ROLES.some((role) => !byRole.has(role)) || subjects.size !== REQUIRED_ROLES.length) reasons.push("T4_BUSINESS_ATTESTATION_MISSING");
  const uniqueReasons = [...new Set(reasons)].sort();
  const result = {
    formatVersion: 1,
    artifactKind: "yuzhou_t4_readiness",
    decision: uniqueReasons.length === 0 ? "READY_FOR_SIGNED_SIMULATION" : "NO_GO",
    productionImport: "HOLD",
    reasonCodes: uniqueReasons,
    sourceBusinessContentSha256: extraction?.businessContentSha256 ?? null,
    executableFormulaCount: formulaApproval?.status === "approved_for_simulation" && Array.isArray(formulaApproval.formulaVersionIds) ? formulaApproval.formulaVersionIds.length : 0,
    tolerancePolicyCount: Array.isArray(policies) ? policies.length : 0,
    acceptedAttestationRoles: [...byRole.keys()].sort(),
  };
  return { ...result, evidenceSha256: createHash("sha256").update(stable(result)).digest("hex") };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const sourceIndex = process.argv.indexOf("--source-evidence");
  const inputsIndex = process.argv.indexOf("--business-inputs");
  const outputIndex = process.argv.indexOf("--output");
  if (sourceIndex < 0 || inputsIndex < 0) throw new Error("--source-evidence and --business-inputs are required");
  const output = compileT4Readiness(readJson(process.argv[sourceIndex + 1]), readJson(process.argv[inputsIndex + 1]));
  const bytes = `${JSON.stringify(output, null, 2)}\n`;
  if (outputIndex >= 0) {
    writeFileSync(resolve(process.argv[outputIndex + 1]), bytes, { mode: 0o600 });
    chmodSync(resolve(process.argv[outputIndex + 1]), 0o600);
  } else process.stdout.write(bytes);
}
