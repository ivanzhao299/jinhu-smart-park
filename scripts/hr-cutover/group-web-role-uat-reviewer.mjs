#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  GroupWebRoleUatError,
  groupWebRoleUatSha256,
  readExternalEvidence,
  writeExternalEvidence
} from "./group-web-role-uat-lib.mjs";
import { independentlyReviewGroupWebRoleUat } from "./group-web-role-uat-independent-review-lib.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CONTRACT = resolve(ROOT, "scripts/hr-cutover/contracts/group-web-role-uat-v1.json");
const MAPPING = resolve(ROOT, "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json");
const SOURCE_AUDIT = resolve(ROOT, "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json");

function parseArgs(argv) {
  const allowed = new Set(["--runtime-coverage", "--deployment-evidence", "--authorization-evidence", "--runtime-technical", "--collector-bundle", "--grant-snapshot", "--observations", "--result", "--output"]);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !value) throw new GroupWebRoleUatError("GROUP_WEB_ROLE_UAT_REVIEW_ARGUMENT_INVALID");
    result[key.slice(2)] = value;
  }
  if (Object.keys(result).length !== 9) throw new GroupWebRoleUatError("GROUP_WEB_ROLE_UAT_REVIEW_ARGUMENT_INVALID");
  return result;
}

export function reviewGroupWebRoleUat({ runtimeCoveragePath, deploymentEvidencePath, authorizationEvidencePath, runtimeTechnicalPath, collectorBundlePath, grantSnapshotPath, observationsPath, resultPath, outputPath }) {
  const runtimeCoverage = readExternalEvidence(runtimeCoveragePath, ROOT);
  const deployment = readExternalEvidence(deploymentEvidencePath, ROOT);
  const authorization = readExternalEvidence(authorizationEvidencePath, ROOT);
  const technical = readExternalEvidence(runtimeTechnicalPath, ROOT);
  const bundle = readExternalEvidence(collectorBundlePath, ROOT);
  const grant = readExternalEvidence(grantSnapshotPath, ROOT);
  const observations = readExternalEvidence(observationsPath, ROOT);
  const result = readExternalEvidence(resultPath, ROOT);
  if (new Set([runtimeCoverage.identity, deployment.identity, authorization.identity, technical.identity, bundle.identity, grant.identity, observations.identity, result.identity]).size !== 8) throw new GroupWebRoleUatError("GROUP_WEB_ROLE_UAT_REVIEW_SOURCE_REUSE");
  const contract = JSON.parse(readFileSync(CONTRACT, "utf8"));
  let reviewed;
  try {
    reviewed = independentlyReviewGroupWebRoleUat({
      root: ROOT,
      contract,
      mapping: JSON.parse(readFileSync(MAPPING, "utf8")),
      sourceAudit: JSON.parse(readFileSync(SOURCE_AUDIT, "utf8")),
      runtimeCoverage: runtimeCoverage.value,
      runtimeCoverageRawSha256: runtimeCoverage.rawSha256,
      deploymentEvidence: deployment.value,
      deploymentEvidenceRawSha256: deployment.rawSha256,
      authorizationEvidence: authorization.value,
      authorizationEvidenceRawSha256: authorization.rawSha256,
      runtimeTechnical: technical.value,
      runtimeTechnicalRawSha256: technical.rawSha256,
      collectorBundle: bundle.value,
      collectorBundleRawSha256: bundle.rawSha256,
      grantSnapshot: grant.value,
      grantSnapshotRawSha256: grant.rawSha256,
      observations: observations.value,
      observationsRawSha256: observations.rawSha256,
      result: result.value
    });
  } catch (error) {
    throw new GroupWebRoleUatError(error?.code ?? "GROUP_WEB_ROLE_UAT_INDEPENDENT_REVIEW_FAILED");
  }
  const review = {
    formatVersion: 1,
    reviewKind: "group_web_role_uat_machine_review",
    status: "MACHINE_VERIFIED",
    surface: "legacy_group_web",
    contractSha256: reviewed.contractSha256,
    runtimeCoverageRawSha256: runtimeCoverage.rawSha256,
    collectorBundleRawSha256: bundle.rawSha256,
    liveCaptureAuthorityRawSha256: reviewed.liveCaptureAuthorityRawSha256,
    liveCaptureAttestationRawSha256: reviewed.liveCaptureAttestationRawSha256,
    grantSnapshotRawSha256: grant.rawSha256,
    observationsRawSha256: observations.rawSha256,
    resultRawSha256: result.rawSha256,
    resultCanonicalSha256: groupWebRoleUatSha256(result.value),
    summary: reviewed.summary,
    legacyRuntimeScoreEligibility: reviewed.legacyRuntimeScoreEligibility,
    clientEvidenceSubstitution: "FORBIDDEN",
    humanAttestation: "HOLD",
    productionImport: "HOLD"
  };
  const written = writeExternalEvidence(outputPath, ROOT, review, "GROUP_WEB_ROLE_UAT_REVIEW_OUTPUT_UNSAFE");
  return { review, written };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const { review, written } = reviewGroupWebRoleUat({ runtimeCoveragePath: args["runtime-coverage"], deploymentEvidencePath: args["deployment-evidence"], authorizationEvidencePath: args["authorization-evidence"], runtimeTechnicalPath: args["runtime-technical"], collectorBundlePath: args["collector-bundle"], grantSnapshotPath: args["grant-snapshot"], observationsPath: args.observations, resultPath: args.result, outputPath: args.output });
    process.stdout.write(`${JSON.stringify({ status: review.status, cells: review.summary.cells, outputSha256: written.rawSha256, humanAttestation: review.humanAttestation, productionImport: review.productionImport })}\n`);
  } catch (error) {
    const code = error instanceof GroupWebRoleUatError ? error.code : "GROUP_WEB_ROLE_UAT_REVIEW_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
