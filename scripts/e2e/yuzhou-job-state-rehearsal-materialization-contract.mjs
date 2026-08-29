#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildItemsDigestProbeSql, buildMaterializationSql, canonicalHash, verifyMaterializationPackage } from "../hr-cutover/materialize-reviewed-job-state.mjs";
import { buildJobStateV2Fixture, h } from "./yuzhou-job-state-v2-fixture.mjs";

const root = resolve(import.meta.dirname, "../.."), schema = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-job-state-private-materialization.schema.json"), "utf8"));
assert.equal(schema.properties.formatVersion.const, 2); assert.equal(schema.properties.machineActor.properties.kind.const, "machine_policy_engine"); assert.equal(schema.properties.productionImport.const, "HOLD"); assert.equal(schema.properties.approvalSubject, undefined); assert.equal(schema.properties.verification, undefined);
const { decision, payload, attestation, config } = buildJobStateV2Fixture(), verified = verifyMaterializationPackage(decision, payload, attestation, config);
assert.equal(verified.decisionResult.status, "MACHINE_CANDIDATE"); assert.equal(verified.verificationMode, "machine_attested");
const sql = buildMaterializationSql(decision, payload, attestation); assert.match(sql, /approved_by=NULL,approved_at=NULL/); assert.match(sql, /verification_mode='machine_attested'/); assert.match(sql, /machine_policy_engine/); assert.doesNotMatch(sql, /human_approved|approvalSubject|approvedAt/); assert.match(buildItemsDigestProbeSql(decision, payload), /machineActor/);

const v1Decision = { formatVersion: 1, artifactKind: "yuzhou_employee_job_state_reviewed_decision" };
assert.throws(() => verifyMaterializationPackage(v1Decision, payload, attestation, config), /MACHINE_CANDIDATE_V2_REQUIRED|YUZHOU_JOB_STATE_/);
const v1Payload = { ...payload, formatVersion: 1, approvalSubject: "00000000-0000-4000-8000-000000000202" }; v1Payload.payloadSha256 = canonicalHash(Object.fromEntries(Object.entries(v1Payload).filter(([key]) => key !== "payloadSha256")));
assert.throws(() => verifyMaterializationPackage(decision, v1Payload, attestation, config), /PRIVATE_PAYLOAD_INVALID|PRIVATE_PAYLOAD_V2_REQUIRED/);
const productionAttestation = { formatVersion: 2, artifactKind: "machine_attestation", attestationVersion: "yuzhou-hr-production-import-machine-attestation-v2", status: "PASS" };
assert.throws(() => verifyMaterializationPackage(decision, payload, productionAttestation, config), /YUZHOU_JOB_STATE_MACHINE_ATTESTATION_INVALID/);
assert.throws(() => verifyMaterializationPackage(decision, payload, attestation, { ...config, machineAttestation: { checkpointVersion: 2, trustedRootSha256: h("f") } }), /YUZHOU_JOB_STATE_MACHINE_TRUST_ROOT_MISMATCH/);
const humanActor = structuredClone(payload); humanActor.machineActor.kind = "human_subject"; humanActor.payloadSha256 = canonicalHash(Object.fromEntries(Object.entries(humanActor).filter(([key]) => key !== "payloadSha256")));
assert.throws(() => verifyMaterializationPackage(decision, humanActor, attestation, config), /MACHINE_ACTOR_INVALID/);
console.log("Yuzhou job-state native v2 materialization contract passed.");
