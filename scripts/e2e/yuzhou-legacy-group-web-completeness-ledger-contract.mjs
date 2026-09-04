import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildGroupWebCompletenessLedger,
  LegacyGroupWebCompletenessLedgerError,
  verifyGroupWebCompletenessLedger,
} from "../hr-cutover/legacy-group-web-completeness-ledger.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(
  root,
  "scripts/hr-cutover/contracts/legacy-group-web-completeness-ledger-v1.json",
);
const readContract = () => JSON.parse(readFileSync(contractPath, "utf8"));

test("Group Web M0 preserves every catalog and interaction denominator without claiming coverage", () => {
  const { ledger, report } = buildGroupWebCompletenessLedger(root, readContract());
  assert.deepEqual(report.summary, {
    table: 438,
    field: 5449,
    view: 768,
    procedure: 340,
    function: 9,
    trigger: 79,
    menu_node: 231,
    navigable_entry: 186,
    asp_page: 4026,
    total: 11526,
  });
  assert.equal(report.opaqueIdentitySlots, 11109);
  assert.equal(report.mappedRecords, 0);
  assert.equal(report.compatibilityScoreContribution, 0);
  assert.equal(ledger.status, "inventory_only_coverage_pending");
  assert.equal(ledger.productionImport, "HOLD");
  assert.equal(
    ledger.records.every(
      (item) =>
        item.sourceSurface === "group_web" &&
        item.denominatorDisposition === "included" &&
        item.modernMapping.status === "coverage_pending",
    ),
    true,
  );
});

test("empty tables null-only fields unused routines and unnavigated pages stay in the denominator", () => {
  const { ledger } = buildGroupWebCompletenessLedger(root, readContract());
  const count = (category) => ledger.records.filter((item) => item.category === category).length;
  assert.equal(count("table"), 438);
  assert.notEqual(count("table"), 215);
  assert.equal(count("field"), 5449);
  assert.equal(count("procedure"), 340);
  assert.equal(count("function"), 9);
  assert.equal(count("trigger"), 79);
  assert.equal(count("asp_page"), 4026);
  assert.equal(count("navigable_entry"), 186);
});

test("known menu and navigable identities are hash-bound while unavailable atomic identities fail closed as opaque", () => {
  const { ledger } = buildGroupWebCompletenessLedger(root, readContract());
  const known = ledger.records.filter((item) =>
    ["menu_node", "navigable_entry"].includes(item.category),
  );
  const opaque = ledger.records.filter((item) => !known.includes(item));
  assert.equal(known.length, 417);
  assert.equal(
    known.every(
      (item) =>
        item.sourceIdentityStatus === "hash_bound_source_identity" &&
        typeof item.sourceIdentity === "string" &&
        /^[a-f0-9]{64}$/u.test(item.sourceEvidenceSha256),
    ),
    true,
  );
  assert.equal(
    opaque.every(
      (item) =>
        item.sourceIdentity === null &&
        item.sourceIdentityStatus === "opaque_slot_pending_authoritative_export" &&
        /^[a-f0-9]{64}$/u.test(item.sourceEvidenceSha256),
    ),
    true,
  );
  assert.deepEqual(
    ledger.missingAuthoritativeInputs.map((item) => item.reasonCode),
    [
      "GROUP_WEB_ATOMIC_SCHEMA_EXPORT_NOT_COMMITTED",
      "GROUP_WEB_ATOMIC_ROUTINE_EXPORT_NOT_COMMITTED",
      "GROUP_WEB_FULL_ASP_MANIFEST_NOT_COMMITTED",
    ],
  );
});

test("source hashes counts policies and completion claims cannot be rewritten", () => {
  const contract = readContract();
  const mutations = [
    (candidate) => {
      candidate.sourceContracts[0].sha256 = "0".repeat(64);
    },
    (candidate) => {
      candidate.expectedCatalog.tables = 215;
    },
    (candidate) => {
      candidate.denominatorPolicy.includeEmptyTables = false;
    },
    (candidate) => {
      candidate.status = "complete";
    },
    (candidate) => {
      candidate.compatibilityScoreContribution = 100;
    },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(contract);
    mutate(candidate);
    assert.throws(
      () => buildGroupWebCompletenessLedger(root, candidate),
      (error) => error instanceof LegacyGroupWebCompletenessLedgerError,
    );
  }
});

test("materialized records cannot self-promote or disappear", () => {
  const contract = readContract();
  const built = buildGroupWebCompletenessLedger(root, contract);
  const cases = [
    (ledger) => {
      ledger.records.pop();
    },
    (ledger) => {
      ledger.records[0].modernMapping.status = "implemented";
      ledger.records[0].modernMapping.targetObject = "invented";
    },
    (ledger) => {
      ledger.records[0].sourceSurface = "client";
    },
    (ledger) => {
      ledger.records[0].sourceIdentity = "invented-table";
      ledger.records[0].sourceIdentityStatus = "hash_bound_source_identity";
    },
  ];
  for (const mutate of cases) {
    const candidate = structuredClone(built.ledger);
    mutate(candidate);
    assert.throws(
      () => verifyGroupWebCompletenessLedger(root, contract, candidate),
      /GROUP_WEB_LEDGER_MATERIALIZATION_DRIFT/u,
    );
  }
});
