#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildLegacyAttendanceSourceRelationshipGapReceipt,
  LegacyAttendanceSourceRelationshipGapError,
} from "../hr-cutover/legacy-bs-readfromleave-u-errandrecords-relationship-gap.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-bs-readfromleave-u-errandrecords-relationship-gap-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const build = value => buildLegacyAttendanceSourceRelationshipGapReceipt({ contract: value, repositoryRoot: root });
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyAttendanceSourceRelationshipGapError && error.code === code);

test("business-trip and leave routines remain separate when no shared source relation is proven", () => {
  const receipt = build(contract());
  assert.deepEqual(receipt.families.map(row => row.canonicalFamily), ["u_errandrecords", "bs_readfromLeave"]);
  assert.deepEqual(receipt.families.map(row => row.modernRequestType), ["business_trip", "leave"]);
  assert.deepEqual(receipt.sharedSourceBusinessTables, []);
  assert.deepEqual(receipt.directRoutineCalls, []);
  assert.equal(receipt.sourceRowIdentityInterchangeable, false);
  assert.equal(receipt.allowedInference, "NONE");
  assert.equal(receipt.decision, "KEEP_SEPARATE_AND_PENDING");
  assert.equal(receipt.status, "SOURCE_RELATIONSHIP_EVIDENCE_MISSING");
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 0, denominator: 1 });
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("aggregate relationship receipt contains no source rows or personal data", () => {
  const receipt = build(contract());
  const serialized = JSON.stringify(receipt);
  assert.equal(receipt.containsSourceRows, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(serialized, /employeeCode|employeeName|personName|reason|startAt|endAt|credential|password|token/iu);
});

test("every bound ledger mapping parity and receipt implementation hash fails closed on drift", () => {
  for (const key of Object.keys(contract().evidenceBindings)) {
    const drifted = contract();
    drifted.evidenceBindings[key].sha256 = "0".repeat(64);
    rejects("ATTENDANCE_SOURCE_RELATIONSHIP_EVIDENCE_DRIFT", () => build(drifted));
  }
  const missing = contract();
  delete missing.evidenceBindings.uErrandrecordsParity;
  rejects("ATTENDANCE_SOURCE_RELATIONSHIP_BINDING_INVALID", () => build(missing));
});

test("contract-only relation promotion or compatibility credit is rejected", () => {
  const promoted = contract();
  promoted.relationshipEvidence.sharedSourceKeyEvidence = "verified";
  promoted.relationshipEvidence.sourceRowIdentityInterchangeable = true;
  promoted.compatibilityCredit = 1;
  rejects("ATTENDANCE_SOURCE_RELATIONSHIP_CONTRACT_INVALID", () => build(promoted));

  const inferred = contract();
  inferred.relationshipEvidence.allowedInference = "errand_is_leave";
  rejects("ATTENDANCE_SOURCE_RELATIONSHIP_PROMOTION_UNPROVEN", () => build(inferred));
});

test("family coverage source tables and modern discriminators are exact", () => {
  const omitted = contract();
  omitted.families.pop();
  rejects("ATTENDANCE_SOURCE_RELATIONSHIP_FAMILY_COVERAGE_INVALID", () => build(omitted));

  const overlapped = contract();
  overlapped.families[0].businessReadTables.push("leave");
  rejects("ATTENDANCE_SOURCE_RELATIONSHIP_FAMILY_INVALID", () => build(overlapped));

  const conflated = contract();
  conflated.families[0].modernRequestType = "leave";
  rejects("ATTENDANCE_SOURCE_RELATIONSHIP_FAMILY_INVALID", () => build(conflated));
});
