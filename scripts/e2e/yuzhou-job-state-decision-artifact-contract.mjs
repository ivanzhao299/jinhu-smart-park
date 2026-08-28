#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import {
  canonicalDecisionHash,
  verifyYuzhouJobStateDecisionArtifact
} from "../hr-cutover/yuzhou-job-state-decision-artifact-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixturePath = resolve(root, "scripts/hr-cutover/fixtures/yuzhou-job-state-decision-artifact/valid-draft-v1.json");
const schemaPath = resolve(root, "scripts/hr-cutover/contracts/yuzhou-job-state-decision-artifact.schema.json");
const verifierPath = resolve(root, "scripts/hr-cutover/verify-yuzhou-job-state-decision-artifact.mjs");
const load = path => JSON.parse(readFileSync(path, "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));
const rejects = (artifact, code) => assert.throws(
  () => verifyYuzhouJobStateDecisionArtifact(artifact),
  error => error?.code === code
);

test("draft decision artifact binds seven hashed source states and remains HOLD", () => {
  const artifact = load(fixturePath);
  const result = verifyYuzhouJobStateDecisionArtifact(artifact);
  assert.deepEqual(result, {
    status: "DRAFT",
    canonicalDecisionSha256: artifact.canonicalDecisionSha256,
    distinctStates: 7,
    observedRecordCount: 100,
    mapped: 4,
    quarantined: 3,
    review: "DRAFT",
    detachedHrApproval: "HOLD",
    materializationEligibility: "HOLD_DETACHED_HR_APPROVAL_REQUIRED",
    productionImport: "HOLD"
  });
  assert.equal(canonicalDecisionHash(artifact), artifact.canonicalDecisionSha256);
  assert.equal(artifact.review.reviewerSubjectSha256, null);
  assert.equal(artifact.detachedHrApproval.attestationSha256, null);
});

test("review binds only the canonical decision while HR approval stays detached", () => {
  const artifact = load(fixturePath);
  artifact.artifactStatus = "REVIEWED";
  artifact.review = {
    status: "REVIEWED",
    reviewerSubjectSha256: "6000000000000000000000000000000000000000000000000000000000000006",
    reviewedDecisionSha256: artifact.canonicalDecisionSha256,
    reviewedAt: "2026-08-28T00:00:00Z"
  };
  const result = verifyYuzhouJobStateDecisionArtifact(artifact);
  assert.equal(result.status, "REVIEWED");
  assert.equal(result.detachedHrApproval, "HOLD");
  assert.equal(result.materializationEligibility, "HOLD_DETACHED_HR_APPROVAL_REQUIRED");
});

test("scope, source, item, review and approval drift fail closed", () => {
  const source = load(fixturePath);
  const cases = [
    [draft => { draft.scopeBinding.tenantIdentitySha256 = "tenant-plain"; }, "YUZHOU_JOB_STATE_SCOPE_HASH_INVALID"],
    [draft => { draft.scopeBinding.parkIdentitySha256 = draft.scopeBinding.tenantIdentitySha256; }, "YUZHOU_JOB_STATE_SCOPE_HASH_COLLISION"],
    [draft => { draft.sourceContract.sourceDistinctStateCount = 6; }, "YUZHOU_JOB_STATE_SOURCE_COUNT_INVALID"],
    [draft => { draft.decisions.pop(); }, "YUZHOU_JOB_STATE_DECISION_COUNT_INVALID"],
    [draft => { draft.decisions[1].sourceIdentitySha256 = draft.decisions[0].sourceIdentitySha256; }, "YUZHOU_JOB_STATE_DECISION_DUPLICATE"],
    [draft => { draft.decisions[1].sourceRowSha256 = draft.decisions[0].sourceRowSha256; }, "YUZHOU_JOB_STATE_DECISION_DUPLICATE"],
    [draft => { draft.decisions[0].observedRecordCount += 1; }, "YUZHOU_JOB_STATE_SOURCE_LEDGER_MISMATCH"],
    [draft => { draft.decisions[0].targetEmploymentStatus = "unknown"; }, "YUZHOU_JOB_STATE_MAP_TARGET_INVALID"],
    [draft => { draft.decisions[4].targetEmploymentStatus = "departed"; }, "YUZHOU_JOB_STATE_QUARANTINE_INVALID"],
    [draft => { draft.decisions.reverse(); }, "YUZHOU_JOB_STATE_DECISION_ORDER_INVALID"],
    [draft => { draft.decisions[0].targetEmploymentStatus = "probation"; }, "YUZHOU_JOB_STATE_CANONICAL_HASH_MISMATCH"],
    [draft => { draft.review.reviewerSubjectSha256 = "6".repeat(64); }, "YUZHOU_JOB_STATE_DRAFT_REVIEW_INVALID"],
    [draft => { draft.artifactStatus = "REVIEWED"; }, "YUZHOU_JOB_STATE_REVIEWER_HASH_INVALID"],
    [draft => { draft.detachedHrApproval.status = "APPROVED"; }, "YUZHOU_JOB_STATE_HR_APPROVAL_MUST_BE_DETACHED"],
    [draft => { draft.productionImport = "GO"; }, "YUZHOU_JOB_STATE_PRODUCTION_IMPORT_NOT_HELD"],
    [draft => { draft.localPath = "/Users/example/source.json"; }, "YUZHOU_JOB_STATE_ARTIFACT_SHAPE_INVALID"]
  ];
  for (const [mutate, code] of cases) {
    const draft = clone(source);
    mutate(draft);
    rejects(draft, code);
  }
});

test("schema freezes the draft/HOLD and seven-state boundaries", () => {
  const schema = load(schemaPath);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.decisions.minItems, 7);
  assert.equal(schema.properties.decisions.maxItems, 7);
  assert.equal(schema.properties.productionImport.const, "HOLD");
  assert.equal(schema.properties.detachedHrApproval.properties.status.const, "HOLD");
  assert.equal(schema.properties.detachedHrApproval.properties.attestationSha256.type, "null");
  assert.deepEqual(schema.$defs.decision.properties.decision.enum, ["map", "quarantine"]);
  assert.deepEqual(
    schema.$defs.decision.properties.targetEmploymentStatus.enum,
    ["active", "probation", "suspended", "departed", null]
  );
});

test("CLI verifies without emitting source values or local paths", () => {
  const output = execFileSync(process.execPath, [verifierPath, "--artifact", fixturePath], {
    cwd: root,
    encoding: "utf8"
  });
  const result = JSON.parse(output);
  assert.equal(result.status, "DRAFT");
  assert.equal(result.distinctStates, 7);
  assert.equal(result.productionImport, "HOLD");
  assert.doesNotMatch(output, /(?:\/Users\/|sourceCode|sourceName|sourceValue)/u);
});

test("committed fixture cannot claim review or human approval", () => {
  const artifact = load(fixturePath);
  assert.equal(artifact.artifactStatus, "DRAFT");
  assert.deepEqual(artifact.review, {
    status: "DRAFT",
    reviewerSubjectSha256: null,
    reviewedDecisionSha256: null,
    reviewedAt: null
  });
  assert.deepEqual(artifact.detachedHrApproval, {
    required: true,
    status: "HOLD",
    attestationSha256: null
  });
});
