#!/usr/bin/env node
import process from "node:process";
import console from "node:console";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { closeSync, constants, fstatSync, openSync, writeFileSync } from "node:fs";
import { currentRepositorySha } from "./execute-production-import.mjs";
import { canonicalT4, exactT4, hashT4, sameT4 } from "./production-import-t4-followon-binding.mjs";
import { readT4PrivateArtifact } from "./production-import-t4-followon-private-stage.mjs";
import { validateT4Runtime } from "./execute-production-t4-followon.mjs";
import { createProductionImportPostgresAdapter } from "./production-import-postgres-adapter.mjs";
import { assertT5FollowonStageBinding, validateT5FollowonAuthorization, validateT5FollowonBinding } from "./t5-followon-binding.mjs";
import { observeT5CoreOwners } from "./t5-followon-core-owners.mjs";
import { readT5FullArchivePrivateStage } from "./t5-full-archive-private-stage.mjs";
import { prepareT5FollowonPhotos } from "./t5-followon-photos.mjs";
import { executeT5Followon, observeT5Payroll } from "./production-import-t5-followon-writer.mjs";
import { reencryptT5MaterializedRows } from "./t5-production-protected-values.mjs";
import { observeT5RuntimeKeyring } from "./t5-followon-runtime-keyring.mjs";
import { createT5ApiContainerPhotoStorage } from "./t5-followon-photo-container-storage.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const OWN_FILES = ["execute-production-t5-followon.mjs", "t5-followon-binding.mjs", "t5-followon-core-owners.mjs",
  "t5-full-archive-private-stage.mjs", "t5-production-protected-values.mjs", "production-import-t5-followon-writer.mjs",
  "production-import-t5-nonfile-stage-adapter.mjs", "production-import-t5-nonfile-writer.mjs", "t5-followon-photos.mjs",
  "t5-followon-photo-local-storage.mjs", "t5-followon-photo-container-storage.mjs", "t5-followon-runtime-keyring.mjs"]
  .map(name => `scripts/hr-cutover/${name}`).concat("database/migrations/000317_hr_yuzhou_t5_followon.sql");
const fail = code => { throw Object.assign(new Error(code), { code }); };
const json = descriptor => JSON.parse(readT4PrivateArtifact(descriptor));

export async function runT5Followon(configDescriptor, mode) {
  if (!["prepare", "execute", "rollback"].includes(mode)) fail("T5_MODE_INVALID");
  const config = json(configDescriptor);
  exactT4(config, ["binding", "authorization", "stage", "sourceKey", "photoBundle", "runtimeEvidence", "databaseBinding", "postgresCredentials"]);
  const binding = validateT5FollowonBinding(json(config.binding)), authorization = json(config.authorization);
  validateT5FollowonAuthorization({ binding, authorization, intent: mode === "rollback" ? "rollback" : "append" });
  if (config.runtimeEvidence.sha256 !== binding.runtimeReceiptSha256 || config.photoBundle.sha256 !== binding.photoBundleSha256) fail("T5_HOST_ARTIFACT_BINDING_DRIFT");
  execFileSync("git", ["ls-files", "--error-unmatch", "--", ...OWN_FILES], { cwd: ROOT, stdio: "ignore" });
  const currentCodeSha = currentRepositorySha(ROOT);
  execFileSync("git", ["merge-base", "--is-ancestor", binding.triple.codeSha, currentCodeSha], { cwd: ROOT, stdio: "ignore" });
  validateT4Runtime(binding, json(config.runtimeEvidence), currentCodeSha);
  const databaseBinding = json(config.databaseBinding), credentials = json(config.postgresCredentials);
  if (!sameT4(databaseBinding.targetScope, binding.targetScope) || databaseBinding.targetIdentitySha256 !== binding.targetIdentitySha256) fail("T5_DATABASE_BINDING_DRIFT");
  exactT4(credentials, ["host", "port", "database", "user", "password"]);
  if (!["127.0.0.1", "::1"].includes(credentials.host) || !Number.isSafeInteger(credentials.port) || credentials.port < 1 || credentials.port > 65535
    || typeof credentials.password !== "string" || !credentials.password.length || credentials.database !== databaseBinding.database
    || credentials.user !== databaseBinding.databaseUser) fail("T5_DATABASE_CREDENTIALS_INVALID");
  const stage = readT5FullArchivePrivateStage(config.stage, assertT5FollowonStageBinding(config.stage, binding));
  const photoBundleBytes = readT4PrivateArtifact(config.photoBundle, 64 * 1024 * 1024);
  const sourceKeyBytes = readT4PrivateArtifact(config.sourceKey, 1024);
  const actualKeyring = observeT5RuntimeKeyring(binding.executionCodeSha);
  if (actualKeyring.observationSha256 !== binding.productionKeyObservationSha256) fail("T5_PRODUCTION_KEY_OBSERVATION_DRIFT");
  const { Client } = await import("pg");
  const client = new Client({ ...credentials, application_name: "jinhu_hr_t5_followon", connectionTimeoutMillis: 10000,
    options: `-c timezone=Asia/Shanghai${mode === "prepare" ? " -c default_transaction_read_only=on" : ""}` });
  await client.connect();
  try {
    const adapter = createProductionImportPostgresAdapter({ client, binding: databaseBinding, ownership: "borrowed" });
    await adapter.probeTarget({ targetIdentitySha256: binding.targetIdentitySha256, targetScope: binding.targetScope });
    const owners = await observeT5CoreOwners(client, binding);
    await observeT5Payroll(client, binding);
    prepareT5FollowonPhotos({ bytes: photoBundleBytes, binding, stage, byCode: owners.byCode });
    reencryptT5MaterializedRows(stage.records, { sourceKeyBytes, productionKeyring: actualKeyring.keyring });
    const actor = (await client.query(`SELECT id::text FROM sys_user WHERE id=$1::uuid AND tenant_id=$2 AND park_id=$3
      AND is_enabled AND NOT is_deleted AND status='enabled'`, [binding.actorId, binding.targetScope.tenantId, binding.targetScope.parkId])).rows;
    if (actor.length !== 1) fail("T5_FOLLOWON_ACTOR_NOT_ACTIVE_IN_SCOPE");
    if (mode === "prepare") return { status: "STRUCTURE_READY", bindingSha256: hashT4(canonicalT4(binding)),
      productionImportExecuted: false, sourceRecords: 20163, productionKeyCompatibilityVerified: true };
    const directory = dirname(configDescriptor.path), fd = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isDirectory() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid()) fail("T5_PRIVATE_DIRECTORY_REQUIRED");
    } finally { closeSync(fd); }
    writeFileSync(resolve(directory, `${binding.operationId}.${mode}.claim`), `${hashT4(canonicalT4(binding))}\n`, { flag: "wx", mode: 0o600, flush: true });
    return await executeT5Followon({ client, binding, authorization, stageInput: config.stage, sourceKeyBytes,
      productionKeyring: actualKeyring.keyring, actorId: binding.actorId,
      photoBundleBytes, photoStorage: createT5ApiContainerPhotoStorage(), rollback: mode === "rollback" });
  } finally {
    sourceKeyBytes.fill(0); actualKeyring.keyring.hashKey.fill(0);
    for (const key of actualKeyring.keyring.keys.values()) key.fill(0);
    await client.end();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 8 || process.argv[2] !== "--config" || process.argv[4] !== "--sha256" || process.argv[6] !== "--mode") fail("T5_ARGUMENTS_INVALID");
    console.log(JSON.stringify(await runT5Followon({ path: process.argv[3], sha256: process.argv[5] }, process.argv[7])));
  } catch (error) {
    const code = /^(?:T5|T4|PRODUCTION_IMPORT)_[A-Z0-9_]+$/u.test(error?.code ?? "") ? error.code : "T5_EXECUTION_FAILED";
    console.log(JSON.stringify({ status: "HOLD", reasonCodes: [code], fullProductMigrationComplete: false })); process.exitCode = 1;
  }
}
