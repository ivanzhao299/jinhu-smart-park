#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildItemsDigestProbeSql, buildMaterializationSql, computeJobStateMachineAttestationSha256, verifyMaterializationPackage } from "../hr-cutover/materialize-reviewed-job-state.mjs";
import { buildJobStateV2Fixture, h } from "./yuzhou-job-state-v2-fixture.mjs";

const root = resolve(import.meta.dirname, "../.."), container = "jinhu-smart-park-postgres", database = `jinhu_hr_migration_lab_full_v2_${randomBytes(4).toString("hex")}`;
const run = (args, input) => spawnSync("docker", ["exec", ...(input ? ["-i"] : []), container, ...args], { cwd: root, input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
if (run(["true"]).status !== 0) throw new Error("DIRECT_PG_CONTAINER_UNAVAILABLE");
let created = false;
try {
  let result = run(["createdb", "-U", "jinhu", database]); assert.equal(result.status, 0, result.stderr); created = true;
  result = run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database, "-c", 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto;']); assert.equal(result.status, 0, result.stderr);
  for (const migration of ["000275_hr_legacy_dictionary_decision.sql", "000283_hr_legacy_dictionary_machine_verification.sql"]) { result = run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database], readFileSync(resolve(root, "database/migrations", migration), "utf8")); assert.equal(result.status, 0, result.stderr); }

  const provisional = buildJobStateV2Fixture({ expectedDatabaseItemsSha256: h("0") });
  result = run(["psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database], buildItemsDigestProbeSql(provisional.decision, provisional.payload)); assert.equal(result.status, 0, result.stderr);
  const itemsSha256 = result.stdout.split("\n").find(line => /^[0-9a-f]{64}$/u.test(line.trim()))?.trim(); assert.match(itemsSha256, /^[0-9a-f]{64}$/u);
  const fixture = buildJobStateV2Fixture({ expectedDatabaseItemsSha256: itemsSha256 }); assert.equal(verifyMaterializationPackage(fixture.decision, fixture.payload, fixture.attestation, fixture.config).verificationMode, "machine_attested");
  const legacyDecision = { ...fixture.decision, formatVersion: 1, artifactStatus: "REVIEWED" }, legacyPayload = { ...fixture.payload, formatVersion: 1 };
  result = run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database], buildMaterializationSql(legacyDecision, legacyPayload, fixture.attestation)); assert.notEqual(result.status, 0); assert.match(result.stderr, /MACHINE_CANDIDATE_V2_REQUIRED/);
  const productionAttestation = { ...fixture.attestation, artifactKind: "machine_attestation", attestationVersion: "yuzhou-hr-production-import-machine-attestation-v2" };
  result = run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database], buildMaterializationSql(fixture.decision, fixture.payload, productionAttestation)); assert.notEqual(result.status, 0); assert.match(result.stderr, /MACHINE_CANDIDATE_V2_REQUIRED/);
  assert.throws(() => verifyMaterializationPackage(fixture.decision, fixture.payload, fixture.attestation, { ...fixture.config, machineAttestation: { checkpointVersion: 2, trustedRootSha256: h("f") } }), /YUZHOU_JOB_STATE_MACHINE_TRUST_ROOT_MISMATCH/);
  result = run(["psql", "-X", "-A", "-t", "-q", "-U", "jinhu", "-d", database, "-c", "SELECT count(*) FROM hr_legacy_dictionary_version; SELECT count(*) FROM hr_legacy_dictionary_item;"]); assert.equal(result.stdout, "0\n0\n", "all cross-layer negative packages must leave PostgreSQL untouched");
  for (let attempt = 0; attempt < 3; attempt += 1) { result = run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database], buildMaterializationSql(fixture.decision, fixture.payload, fixture.attestation)); assert.equal(result.status, 0, result.stderr); }
  const attestationSha256 = computeJobStateMachineAttestationSha256(fixture.attestation);
  result = run(["psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database, "-c", "SELECT verification_mode||':'||verification_actor_kind||':'||(approved_by IS NULL)::text||':'||(approved_at IS NULL)::text||':'||machine_attestation_sha256||':'||machine_evidence_root_sha256||':'||count(*) OVER() FROM hr_legacy_dictionary_version; SELECT count(*) FROM hr_legacy_dictionary_item;"]); assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`machine_attested:machine_policy_engine:true:true:${attestationSha256}:${fixture.trustedRootSha256}:1`)); assert.match(result.stdout, /\n7\n/u);

  const baseline = result.stdout;
  const driftPayload = structuredClone(fixture.payload); driftPayload.items[0].id = "00000000-0000-4000-8000-000000000088";
  result = run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database], buildMaterializationSql(fixture.decision, driftPayload, fixture.attestation)); assert.notEqual(result.status, 0); assert.match(result.stderr, /MATERIALIZATION_REPLAY_DRIFT/);
  result = run(["psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database, "-c", "SELECT verification_mode||':'||verification_actor_kind||':'||(approved_by IS NULL)::text||':'||(approved_at IS NULL)::text||':'||machine_attestation_sha256||':'||machine_evidence_root_sha256||':'||count(*) OVER() FROM hr_legacy_dictionary_version; SELECT count(*) FROM hr_legacy_dictionary_item;"]); assert.equal(result.stdout, baseline);

  result = run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database, "-c", "UPDATE hr_legacy_dictionary_version SET approved_by='00000000-0000-4000-8000-000000000202' WHERE id='00000000-0000-4000-8000-000000000099';"]); assert.notEqual(result.status, 0); assert.match(result.stderr, /HR_LEGACY_DICTIONARY_APPROVED_IMMUTABLE|ck_hr_legacy_dictionary_verification/);
  console.log("Yuzhou job-state native v2 direct PostgreSQL materialization and replay passed.");
} finally { if (created) run(["dropdb", "-U", "jinhu", "--if-exists", database]); }
