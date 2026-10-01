#!/usr/bin/env node
/* global process, console */
import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, openSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { currentRepositorySha } from "./execute-production-import.mjs";
import { DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT, computeProductionImportTargetScopeHash } from "./production-import-sealed-plan-lib.mjs";
import { createProductionImportPostgresAdapter } from "./production-import-postgres-adapter.mjs";
import { canonicalT4, exactT4, failT4, hashT4, sameT4, validateT4Authorization, validateT4Binding } from "./production-import-t4-followon-binding.mjs";
import { readT4PrivateArtifact, readT4PrivateStage } from "./production-import-t4-followon-private-stage.mjs";
import { executeT4Followon, observeT4Parent } from "./production-import-t4-followon-writer.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const OWN_DEPENDENCIES = ["execute-production-t4-followon.mjs", "production-import-t4-followon-binding.mjs", "production-import-t4-followon-private-stage.mjs", "production-import-t4-followon-writer.mjs", "production-import-t4-followon-sql.mjs"].map(name => `scripts/hr-cutover/${name}`).concat("database/migrations/000316_hr_yuzhou_t4_followon.sql");
const json = descriptor => JSON.parse(readT4PrivateArtifact(descriptor));

export function validateT4Runtime(binding, runtime, currentCodeSha, now = new Date()) {
  const target = DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT.activation.allowedTargets;
  if (runtime.formatVersion !== 1 || runtime.artifactKind !== "yuzhou_hr_production_import_runtime_release_receipt" || ![currentCodeSha, runtime.currentCodeSha, runtime.mergedCodeSha, runtime.runtimeCodeSha].every(sha => sha === binding.executionCodeSha) || runtime.targetIdentitySha256 !== binding.targetIdentitySha256 || runtime.targetScopeSha256 !== binding.targetScopeSha256) failT4("T4_RUNTIME_SHA_OR_SCOPE_DRIFT");
  if (target.length !== 1 || target[0].identitySha256 !== binding.targetIdentitySha256 || target[0].targetScopeSha256 !== binding.targetScopeSha256 || binding.targetScopeSha256 !== computeProductionImportTargetScopeHash(binding.targetScope)) failT4("T4_TARGET_NOT_ALLOWLISTED");
  if (!(Date.parse(runtime.observedAt) <= +new Date(now) && +new Date(now) < Date.parse(runtime.expiresAt) && Date.parse(runtime.expiresAt) <= Date.parse(binding.windowEndsAt))) failT4("T4_RUNTIME_EXPIRED");
}

export async function runT4Followon(configDescriptor, mode) {
  if (!["prepare", "execute", "rollback"].includes(mode)) failT4("T4_MODE_INVALID");
  const config = json(configDescriptor);
  exactT4(config, ["binding", "authorization", "parentReceipt", "stage", "runtimeEvidence", "databaseBinding", "postgresCredentials"]);
  const binding = validateT4Binding(json(config.binding));
  const authorization = json(config.authorization);
  const parentReceipt = json(config.parentReceipt);
  validateT4Authorization({ binding, authorization, intent: mode === "rollback" ? "rollback" : "append" });
  const runtime = json(config.runtimeEvidence);
  if (config.runtimeEvidence.sha256 !== binding.runtimeReceiptSha256) failT4("T4_RUNTIME_HASH_MISMATCH");
  execFileSync("git", ["ls-files", "--error-unmatch", "--", ...OWN_DEPENDENCIES], { cwd: ROOT, stdio: "ignore" });
  const currentCodeSha = currentRepositorySha(ROOT);
  execFileSync("git", ["merge-base", "--is-ancestor", binding.triple.codeSha, currentCodeSha], { cwd: ROOT, stdio: "ignore" });
  validateT4Runtime(binding, runtime, currentCodeSha);
  const databaseBinding = json(config.databaseBinding);
  if (!sameT4(databaseBinding.targetScope, binding.targetScope) || databaseBinding.targetIdentitySha256 !== binding.targetIdentitySha256) failT4("T4_DATABASE_BINDING_DRIFT");
  const credentials = json(config.postgresCredentials);
  exactT4(credentials, ["host", "port", "database", "user", "password"]);
  if (!["127.0.0.1", "::1"].includes(credentials.host) || !Number.isSafeInteger(credentials.port) || credentials.port < 1 || credentials.port > 65535 || typeof credentials.password !== "string" || !credentials.password.length || credentials.database !== databaseBinding.database || credentials.user !== databaseBinding.databaseUser) failT4("T4_DATABASE_CREDENTIALS_INVALID");
  const stage = mode === "rollback" ? undefined : readT4PrivateStage(config.stage, binding);
  const { Client } = await import("pg");
  const client = new Client({ ...credentials, application_name: "jinhu_hr_t4_followon", connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    const adapter = createProductionImportPostgresAdapter({ client, binding: databaseBinding, ownership: "borrowed" });
    await adapter.probeTarget({ targetIdentitySha256: binding.targetIdentitySha256, targetScope: binding.targetScope });
    const observed = await observeT4Parent(client, binding, parentReceipt);
    if (observed.recordSetSha256 !== binding.parent.recordSetSha256) failT4("T4_PARENT_RECORD_HASH_MISMATCH");
    if (mode === "prepare") return { status: "STRUCTURE_READY", bindingSha256: hashT4(canonicalT4(binding)), productionImport: "HOLD", productionImportExecuted: false, published: false };
    // Durable local claim survives ambiguous COMMIT/network failures. It is never
    // automatically cleared; inspect the database receipt before any recovery.
    const directory = dirname(configDescriptor.path);
    const fd = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { const stat = fstatSync(fd); if (!stat.isDirectory() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid()) failT4("T4_PRIVATE_DIRECTORY_REQUIRED"); } finally { closeSync(fd); }
    writeFileSync(resolve(directory, `${binding.operationId}.${mode}.claim`), `${hashT4(canonicalT4(binding))}\n`, { flag: "wx", mode: 0o600, flush: true });
    return await executeT4Followon({ client, binding, authorization, parentReceipt, stage, rollback: mode === "rollback" });
  } finally { await client.end(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 8 || process.argv[2] !== "--config" || process.argv[4] !== "--sha256" || process.argv[6] !== "--mode") failT4("T4_ARGUMENTS_INVALID");
    console.log(JSON.stringify(await runT4Followon({ path: process.argv[3], sha256: process.argv[5] }, process.argv[7])));
  } catch (error) {
    const code = /^T4_[A-Z0-9_]+$/u.test(error?.code ?? "") ? error.code : "T4_EXECUTION_FAILED";
    console.log(JSON.stringify({ status: "HOLD", reasonCodes: [code], fullProductMigrationComplete: false }));
    process.exitCode = 1;
  }
}
