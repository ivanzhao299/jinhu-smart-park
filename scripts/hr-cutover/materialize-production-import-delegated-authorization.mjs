#!/usr/bin/env node
/* global Buffer, process, URL */
/** Explicit private one-owner authorization producer; never calls an executor. */
import { createPrivateKey } from "node:crypto";
import { lstatSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { authorizeDelegatedProductionImport } from "./production-import-delegated-authorization.mjs";
import { approvalPolicyHash } from "./production-import-approval-policy.mjs";
import { currentCandidateFreezeRepositorySha, readProductionImportPrivateBytes as read,
  productionImportPrivateDirectory as directory, productionImportCanonicalPath as canonicalPath,
  sameProductionImportPrivateFile as sameFile, parseProductionImportPrivateJson as parse,
  measureProductionImportPrivateJson as measure, emitProductionImportPrivateArtifacts as emit } from "./materialize-production-import-frozen-decisions.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/u, ""), MIB = 1024 ** 2;
const dependencies = ["scripts/hr-cutover/production-import-approval-policy.mjs", "scripts/hr-cutover/production-import-delegated-authorization.mjs", "scripts/hr-cutover/production-import-exception-preparation.mjs", "scripts/hr-cutover/production-import-crypto-provider.mjs", "scripts/hr-cutover/materialize-production-import-delegated-authorization.mjs"];
const fail = () => { const error = new Error("PRODUCTION_IMPORT_DELEGATED_AUTHORIZATION_FAILED"); error.code = error.message; throw error; };
function exact(value, keys) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail(); }
export function materializeProductionImportDelegatedAuthorization(configPath, {
  currentHead = () => currentCandidateFreezeRepositorySha(ROOT, dependencies), now = new Date(),
  maximumReadBytes = 128 * MIB, maximumOutputBytes = MIB,
} = {}) {
  let signingBytes;
  try {
    if (!Number.isSafeInteger(maximumReadBytes) || maximumReadBytes < 1 || maximumReadBytes > 128 * MIB
      || !Number.isSafeInteger(maximumOutputBytes) || maximumOutputBytes < 1 || maximumOutputBytes > MIB) fail();
    const budget = { bytes: 0, maximum: maximumReadBytes }, snapshots = [];
    const load = (path, maximum) => {
      const parts = [], result = read(path, maximum, budget, part => parts.push(Buffer.from(part)));
      snapshots.push({ path, stat: result.stat });
      const bytes = Buffer.concat(parts); parts.forEach(part => part.fill(0));
      return { path, bytes, sha256: result.sha256 };
    };
    const configArtifact = load(configPath, MIB), config = parse(configArtifact.bytes);
    exact(config, ["formatVersion", "mode", "triple", "artifacts", "outputDir"]);
    if (config.formatVersion !== 1 || config.mode !== "authorize" || config.triple?.codeSha !== currentHead()) fail();
    exact(config.artifacts, ["confirmation", "confirmationSource", "prepared", "reviewed", "bridgeEvidence", "operatorKeyFile"]);
    const outputStat = directory(config.outputDir);
    if (readdirSync(config.outputDir).length) fail();
    const artifact = (descriptor, maximum) => {
      exact(descriptor, ["path", "sha256"]);
      const value = load(descriptor.path, maximum);
      if (value.sha256 !== descriptor.sha256) { value.bytes.fill(0); fail(); }
      return value;
    };
    const input = Object.fromEntries(["confirmation", "confirmationSource", "prepared", "reviewed", "bridgeEvidence"].map(name => [`${name}Artifact`, artifact(config.artifacts[name], name === "confirmationSource" ? MIB : 32 * MIB)]));
    const confirmation = parse(input.confirmationArtifact.bytes);
    exact(config.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
    const triple = confirmation.context?.binding?.triple;
    if (!triple || ["codeSha", "sourceSnapshotHash", "mappingContractHash"].some(key => triple[key] !== config.triple[key])) fail();
    signingBytes = artifact(config.artifacts.operatorKeyFile, 16 * 1024).bytes;
    const operatorSigningKey = createPrivateKey(signingBytes);
    const result = authorizeDelegatedProductionImport(input, { operatorSigningKey, now });
    const context = confirmation.context;
    const authorization = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_one_time_authorization", intent: "production_import",
      operationId: context.operationId, status: "APPROVED", issuedAt: context.issuedAt, expiresAt: context.expiresAt,
      binding: context.binding, ...result, authorizationNonceSha256: context.nonceSha256,
      restoreAuthorityArtifactAccepted: false, secretDelivery: "OUT_OF_BAND_REQUIRED", productionImport: "HOLD" };
    const artifacts = { "one-time-import-authorization.json": authorization,
      ...(context.binding.manifestSha256 ? { "sealed-authorization.json": { intent: "production_import", artifactSha256: approvalPolicyHash(authorization), nonceSha256: context.nonceSha256,
        issuedAt: context.issuedAt, expiresAt: context.expiresAt, binding: context.binding, ...result } } : {}) };
    const descriptors = Object.fromEntries(Object.entries(artifacts).map(([name, value]) => [name, measure(value, maximumOutputBytes)]));
    const receipt = { formatVersion: 1, artifactKind: "yuzhou_hr_single_owner_authorization_receipt", materializationStatus: "COMPLETE", policyKind: result.approvalPolicy.kind,
      configArtifactSha256: configArtifact.sha256, artifacts: descriptors, ownerPersonallySigned: false, signerAuthorityEstablished: false, executionReachable: false, productionImport: "HOLD" };
    measure(receipt, maximumOutputBytes);
    if (config.triple.codeSha !== currentHead()) fail();
    for (const item of snapshots) { canonicalPath(item.path); if (!sameFile(item.stat, lstatSync(item.path))) fail(); }
    directory(config.outputDir, outputStat);
    emit(config.outputDir, artifacts, receipt, descriptors, maximumOutputBytes, "single-owner-authorization-receipt.json");
    return { status: "DELEGATED_AUTHORIZATION_MATERIALIZED", artifacts: descriptors, ownerPersonallySigned: false, executionReachable: false, productionImport: "HOLD" };
  } catch { fail(); }
  finally { signingBytes?.fill(0); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== "--config") fail();
    process.stdout.write(JSON.stringify(materializeProductionImportDelegatedAuthorization(process.argv[3])) + "\n");
  } catch { process.stderr.write("PRODUCTION_IMPORT_DELEGATED_AUTHORIZATION_FAILED\n"); process.exitCode = 1; }
}
