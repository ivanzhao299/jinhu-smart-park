#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { GroupWebRoleUatError, readExternalEvidence, writeExternalEvidence } from "./group-web-role-uat-lib.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SOURCE = fileURLToPath(import.meta.url);
const CONTRACT_PATH = resolve(ROOT, "scripts/hr-cutover/contracts/group-web-role-uat-v1.json");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = code => { throw new GroupWebRoleUatError(code); };

const parse = argv => {
  const allowed = new Set(["--runtime-coverage", "--deployment-evidence", "--authorization-evidence", "--runtime-technical", "--live-attestation", "--output"]), values = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!allowed.has(argv[index]) || !argv[index + 1]) fail("GROUP_WEB_ROLE_UAT_COLLECTOR_ARGUMENT_INVALID");
    values[argv[index].slice(2)] = argv[index + 1];
  }
  if (![5, 6].includes(Object.keys(values).length) || !["runtime-coverage", "deployment-evidence", "authorization-evidence", "runtime-technical", "output"].every(key => values[key])) fail("GROUP_WEB_ROLE_UAT_COLLECTOR_ARGUMENT_INVALID");
  return values;
};

export function collectGroupWebRoleUat({ runtimeCoveragePath, deploymentEvidencePath, authorizationEvidencePath, runtimeTechnicalPath, liveCaptureAttestationPath, outputPath }) {
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
  const authorityBytes = readFileSync(resolve(ROOT, contract.liveCaptureAuthorityPath));
  const authority = JSON.parse(authorityBytes);
  const collectorSourceRawSha256 = sha(readFileSync(SOURCE));
  if (contract.collectorSourcePath !== "scripts/hr-cutover/group-web-role-uat-readonly-collector.mjs" || contract.collectorSourceRawSha256 !== collectorSourceRawSha256) fail("GROUP_WEB_ROLE_UAT_COLLECTOR_SOURCE_DRIFT");
  if (sha(authorityBytes) !== contract.liveCaptureAuthorityRawSha256 || authority.contractKind !== "group_web_role_uat_live_capture_authority" || authority.authorizedAttestationRawSha256 !== null) fail("GROUP_WEB_ROLE_UAT_LIVE_AUTHORITY_INVALID");
  const runtimeCoverage = readExternalEvidence(runtimeCoveragePath, ROOT), deployment = readExternalEvidence(deploymentEvidencePath, ROOT), authorization = readExternalEvidence(authorizationEvidencePath, ROOT), technical = readExternalEvidence(runtimeTechnicalPath, ROOT);
  const attestation = liveCaptureAttestationPath ? readExternalEvidence(liveCaptureAttestationPath, ROOT) : null;
  const identities = [runtimeCoverage.identity, deployment.identity, authorization.identity, technical.identity, ...(attestation ? [attestation.identity] : [])];
  if (new Set(identities).size !== identities.length) fail("GROUP_WEB_ROLE_UAT_COLLECTOR_SOURCE_REUSE");
  if (attestation && (authority.authorizedAttestationRawSha256 === null || attestation.rawSha256 !== authority.authorizedAttestationRawSha256)) fail("GROUP_WEB_ROLE_UAT_ATTESTATION_NOT_AUTHORIZED");
  if (deployment.value?.kind !== "group_web_deployment_identity" || authorization.value?.kind !== "group_web_authorization_authority" || technical.value?.kind !== "group_web_role_uat_runtime_technical"
    || [deployment.value, authorization.value, technical.value].some(value => value.surface !== "legacy_group_web" || value.captureMode !== "authenticated_readonly" || value.sourceInventoryHash !== contract.sourceInventoryHash || value.productionImport !== "HOLD")
    || authorization.value.runtimeCoverageRawSha256 !== runtimeCoverage.rawSha256 || technical.value.runtimeCoverageRawSha256 !== runtimeCoverage.rawSha256
    || technical.value.deploymentEvidenceRawSha256 !== deployment.rawSha256 || technical.value.authorizationEvidenceRawSha256 !== authorization.rawSha256
    || !Array.isArray(authorization.value.cells) || authorization.value.cells.length !== 36 || !Array.isArray(technical.value.cells) || technical.value.cells.length !== 36
    || technical.value.cells.some(cell => cell.sourceBeforeSha256 !== cell.sourceAfterSha256 || cell.auditObserved !== true || cell.postLogoutSessionRejected !== true || cell.clientStorageEmpty !== true)) fail("GROUP_WEB_ROLE_UAT_COLLECTOR_SEMANTIC_INVALID");
  const bundle = { formatVersion: 1, kind: "group_web_role_uat_readonly_capture_bundle", status: "CAPTURED_READ_ONLY", surface: "legacy_group_web", collectorContractSha256: contract.collectorContractSha256, collectorSourceRawSha256, liveCaptureAuthorityRawSha256: contract.liveCaptureAuthorityRawSha256, liveCaptureAttestationRawSha256: null, legacyRuntimeScoreEligibility: "HOLD_NO_AUTHORIZED_ATTESTATION", runtimeCoverageRawSha256: runtimeCoverage.rawSha256, deploymentEvidenceRawSha256: deployment.rawSha256, authorizationEvidenceRawSha256: authorization.rawSha256, runtimeTechnicalRawSha256: technical.rawSha256, cells: 36, productionImport: "HOLD" };
  const written = writeExternalEvidence(outputPath, ROOT, bundle, "GROUP_WEB_ROLE_UAT_COLLECTOR_OUTPUT_UNSAFE");
  return { bundle, written };
}

if (process.argv[1] && resolve(process.argv[1]) === SOURCE) {
  try {
    const args = parse(process.argv.slice(2));
    const { written } = collectGroupWebRoleUat({ runtimeCoveragePath: args["runtime-coverage"], deploymentEvidencePath: args["deployment-evidence"], authorizationEvidencePath: args["authorization-evidence"], runtimeTechnicalPath: args["runtime-technical"], liveCaptureAttestationPath: args["live-attestation"], outputPath: args.output });
    process.stdout.write(`${JSON.stringify({ status: "CAPTURED_READ_ONLY", outputSha256: written.rawSha256, productionImport: "HOLD" })}\n`);
  } catch (error) {
    process.stderr.write(`${error?.code ?? "GROUP_WEB_ROLE_UAT_COLLECTOR_FAILED"}\n`); process.exitCode = 1;
  }
}
