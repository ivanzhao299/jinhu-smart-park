#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  assessGroupWebRoleUat,
  GroupWebRoleUatError,
  readExternalEvidence,
  writeExternalEvidence
} from "./group-web-role-uat-lib.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CONTRACT = resolve(ROOT, "scripts/hr-cutover/contracts/group-web-role-uat-v1.json");
const MAPPING = resolve(ROOT, "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json");
const SOURCE_AUDIT = resolve(ROOT, "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json");

function parseArgs(argv) {
  const allowed = new Set(["--runtime-coverage", "--deployment-evidence", "--authorization-evidence", "--runtime-technical", "--collector-bundle", "--grant-snapshot", "--observations", "--output"]);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !value) throw new GroupWebRoleUatError("GROUP_WEB_ROLE_UAT_ARGUMENT_INVALID");
    result[key.slice(2)] = value;
  }
  if (Object.keys(result).length !== 8) throw new GroupWebRoleUatError("GROUP_WEB_ROLE_UAT_ARGUMENT_INVALID");
  return result;
}

export function runGroupWebRoleUat({ runtimeCoveragePath, deploymentEvidencePath, authorizationEvidencePath, runtimeTechnicalPath, collectorBundlePath, grantSnapshotPath, observationsPath, outputPath }) {
  const runtimeCoverage = readExternalEvidence(runtimeCoveragePath, ROOT);
  const deploymentEvidence = readExternalEvidence(deploymentEvidencePath, ROOT);
  const authorizationEvidence = readExternalEvidence(authorizationEvidencePath, ROOT);
  const runtimeTechnical = readExternalEvidence(runtimeTechnicalPath, ROOT);
  const collectorBundle = readExternalEvidence(collectorBundlePath, ROOT);
  const grant = readExternalEvidence(grantSnapshotPath, ROOT);
  const observations = readExternalEvidence(observationsPath, ROOT);
  if (new Set([runtimeCoverage.identity, deploymentEvidence.identity, authorizationEvidence.identity, runtimeTechnical.identity, collectorBundle.identity, grant.identity, observations.identity]).size !== 7) throw new GroupWebRoleUatError("GROUP_WEB_ROLE_UAT_SOURCE_REUSE");
  const result = assessGroupWebRoleUat({
    contract: JSON.parse(readFileSync(CONTRACT, "utf8")),
    mapping: JSON.parse(readFileSync(MAPPING, "utf8")),
    sourceAudit: JSON.parse(readFileSync(SOURCE_AUDIT, "utf8")),
    runtimeCoverage: runtimeCoverage.value,
    runtimeCoverageRawSha256: runtimeCoverage.rawSha256,
    deploymentEvidence: deploymentEvidence.value,
    deploymentEvidenceRawSha256: deploymentEvidence.rawSha256,
    authorizationEvidence: authorizationEvidence.value,
    authorizationEvidenceRawSha256: authorizationEvidence.rawSha256,
    runtimeTechnical: runtimeTechnical.value,
    runtimeTechnicalRawSha256: runtimeTechnical.rawSha256,
    collectorBundle: collectorBundle.value,
    collectorBundleRawSha256: collectorBundle.rawSha256,
    grantSnapshot: grant.value,
    grantSnapshotRawSha256: grant.rawSha256,
    observations: observations.value,
    observationsRawSha256: observations.rawSha256
  });
  const written = writeExternalEvidence(outputPath, ROOT, result);
  return { result, written };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const { result, written } = runGroupWebRoleUat({ runtimeCoveragePath: args["runtime-coverage"], deploymentEvidencePath: args["deployment-evidence"], authorizationEvidencePath: args["authorization-evidence"], runtimeTechnicalPath: args["runtime-technical"], collectorBundlePath: args["collector-bundle"], grantSnapshotPath: args["grant-snapshot"], observationsPath: args.observations, outputPath: args.output });
    process.stdout.write(`${JSON.stringify({ status: result.status, cells: result.summary.cells, outputSha256: written.rawSha256, humanAttestation: result.humanAttestation, productionImport: result.productionImport })}\n`);
  } catch (error) {
    const code = error instanceof GroupWebRoleUatError ? error.code : "GROUP_WEB_ROLE_UAT_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
