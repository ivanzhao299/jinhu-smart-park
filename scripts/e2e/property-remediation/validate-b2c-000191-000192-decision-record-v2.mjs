#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DECISIONS = Object.freeze(["DEC-01", "DEC-02", "DEC-03", "DEC-04", "DEC-05", "DEC-06"]);
const BASE_RECORD_KEYS = Object.freeze([
  "proposal_sha256", "trusted_signer_directory_sha256", "decisions", "decision_makers",
  "approvals", "decided_at", "acknowledgements"
]);
const VALID_ROLES = new Set([
  "product-owner", "finance-owner", "data-owner", "homestay-domain-owner",
  "housing-domain-owner", "property-domain-owner", "schema-migration-owner",
  "authority-owner", "audit-security-owner"
]);
const ALLOWED_BRANCHES = Object.freeze({
  "DEC-01": ["A", "replacement"],
  "DEC-02": ["A", "B", "replacement"],
  "DEC-03": ["A", "B", "replacement"],
  "DEC-04": ["A", "replacement"],
  "DEC-05": ["A", "replacement"],
  "DEC-06": ["A", "replacement"]
});
const REQUIRED_ROLES = Object.freeze({
  "DEC-01": ["product-owner", "homestay-domain-owner", "finance-owner"],
  "DEC-02": ["product-owner", "finance-owner", "data-owner"],
  "DEC-03": ["product-owner", "finance-owner", "data-owner"],
  "DEC-04": ["product-owner", "housing-domain-owner", "finance-owner"],
  "DEC-05": ["product-owner", "housing-domain-owner", "finance-owner", ["data-owner", "audit-security-owner"]],
  "DEC-06": ["product-owner", "housing-domain-owner", "finance-owner", "audit-security-owner"]
});
const CNY_ATTESTATION = "All legacy housing monetary data in scope may be interpreted and backfilled as CNY.";
const PROPOSAL_PATH = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
  ".trellis/tasks/07-30-pr192-b-domain-integrations/research/" +
    "b2c-000191-000192-contract-change-control-proposal-v2-20260803.md"
);

function fail(message) {
  throw new Error(message);
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} must contain exactly ${wanted.join(", ")}`);
  }
}

function assertTimestamp(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    fail(`${label} must be an RFC3339 timestamp with timezone`);
  }
  if (Number.isNaN(Date.parse(value))) fail(`${label} is not a valid timestamp`);
}

function rolesSatisfied(signatures, requirements) {
  const roles = new Set(signatures.map((signature) => signature.signer_role));
  for (const requirement of requirements) {
    if (Array.isArray(requirement)) {
      if (!requirement.some((role) => roles.has(role))) return false;
    } else if (!roles.has(requirement)) {
      return false;
    }
  }
  return true;
}

function verifyDelegation(signatures, makers, decisionId) {
  const rolesByIdentity = new Map();
  for (const signature of signatures) {
    const roles = rolesByIdentity.get(signature.signer_identity) ?? [];
    roles.push(signature.signer_role);
    rolesByIdentity.set(signature.signer_identity, roles);
  }
  for (const [identity, roles] of rolesByIdentity) {
    if (new Set(roles).size <= 1) continue;
    const statement = makers.get(identity)?.delegation_statement;
    if (typeof statement !== "string" || !statement.trim()) {
      fail(`${decisionId} signer ${identity} represents multiple roles without a delegation_statement`);
    }
    for (const role of new Set(roles)) {
      if (!statement.includes(role)) {
        fail(`${decisionId} delegation_statement for ${identity} does not name role ${role}`);
      }
    }
  }
}

async function main() {
  if (process.argv.length !== 4) {
    fail("usage: validate-b2c-000191-000192-decision-record-v2.mjs <record.json> <trusted-signer-directory.json>");
  }
  const recordPath = resolve(process.argv[2]);
  const directoryPath = resolve(process.argv[3]);
  const [recordBytes, directoryBytes, proposalBytes] = await Promise.all([
    readFile(recordPath), readFile(directoryPath), readFile(PROPOSAL_PATH)
  ]);
  const record = JSON.parse(recordBytes.toString("utf8"));
  const directory = JSON.parse(directoryBytes.toString("utf8"));
  const proposalSha256 = createHash("sha256").update(proposalBytes).digest("hex");
  const directorySha256 = createHash("sha256").update(directoryBytes).digest("hex");
  if (record.proposal_sha256 !== proposalSha256) fail("proposal_sha256 does not match the current v2 proposal bytes");
  if (record.trusted_signer_directory_sha256 !== directorySha256) {
    fail("trusted_signer_directory_sha256 does not match the supplied directory bytes");
  }

  assertExactKeys(directory, ["authority_id", "issued_at", "issued_by", "entries"], "trusted signer directory");
  if (typeof directory.authority_id !== "string" || !directory.authority_id.trim()) fail("directory authority_id is required");
  if (typeof directory.issued_by !== "string" || !directory.issued_by.trim()) fail("directory issued_by is required");
  assertTimestamp(directory.issued_at, "directory issued_at");
  if (!Array.isArray(directory.entries) || directory.entries.length === 0) fail("directory entries are required");
  const trustedMakers = new Map();
  for (const entry of directory.entries) {
    const entryKeys = new Set(["identity", "roles", "delegation_statement", "evidence_reference"]);
    if (!entry || typeof entry.identity !== "string" || !entry.identity.trim()) fail("trusted identity is required");
    if (trustedMakers.has(entry.identity)) fail(`duplicate trusted identity ${entry.identity}`);
    if (Object.keys(entry).some((key) => !entryKeys.has(key))) fail(`trusted identity ${entry.identity} contains an unknown field`);
    if (!Array.isArray(entry.roles) || entry.roles.length === 0 || new Set(entry.roles).size !== entry.roles.length) {
      fail(`trusted identity ${entry.identity} must declare unique roles`);
    }
    if (entry.roles.some((role) => !VALID_ROLES.has(role))) fail(`trusted identity ${entry.identity} declared an unknown role`);
    if (typeof entry.evidence_reference !== "string" || !entry.evidence_reference.trim()) {
      fail(`trusted identity ${entry.identity} requires evidence_reference`);
    }
    trustedMakers.set(entry.identity, entry);
  }

  const allowedRecordKeys = new Set([...BASE_RECORD_KEYS, "legacy_cny_attestation"]);
  if (!record || typeof record !== "object" || Array.isArray(record)) fail("record must be an object");
  if (Object.keys(record).some((key) => !allowedRecordKeys.has(key))) fail("record contains an unknown top-level field");
  assertExactKeys(record.decisions, DECISIONS, "decisions");
  assertExactKeys(record.approvals, DECISIONS, "approvals");
  assertTimestamp(record.decided_at, "decided_at");

  if (!Array.isArray(record.decision_makers) || record.decision_makers.length === 0) {
    fail("decision_makers must be a non-empty array");
  }
  const makers = new Map();
  for (const maker of record.decision_makers) {
    if (!maker || typeof maker.identity !== "string" || !maker.identity.trim()) fail("decision maker identity is required");
    if (makers.has(maker.identity)) fail(`duplicate decision maker identity ${maker.identity}`);
    if (!Array.isArray(maker.roles) || maker.roles.length === 0 || new Set(maker.roles).size !== maker.roles.length) {
      fail(`decision maker ${maker.identity} must declare unique roles`);
    }
    if (maker.roles.some((role) => !VALID_ROLES.has(role))) fail(`decision maker ${maker.identity} declared an unknown role`);
    const makerKeys = new Set(["identity", "roles", "delegation_statement"]);
    if (Object.keys(maker).some((key) => !makerKeys.has(key))) fail(`decision maker ${maker.identity} contains an unknown field`);
    const trusted = trustedMakers.get(maker.identity);
    if (!trusted) fail(`decision maker ${maker.identity} is absent from the trusted signer directory`);
    if (maker.roles.some((role) => !trusted.roles.includes(role))) {
      fail(`decision maker ${maker.identity} claimed a role absent from the trusted signer directory`);
    }
    if ((maker.delegation_statement ?? null) !== (trusted.delegation_statement ?? null)) {
      fail(`decision maker ${maker.identity} delegation_statement differs from the trusted signer directory`);
    }
    makers.set(maker.identity, maker);
  }

  for (const decisionId of DECISIONS) {
    const decision = record.decisions[decisionId];
    const branch = decision?.branch;
    if (typeof branch !== "string" || !branch) fail(`${decisionId} branch is required`);
    if (!ALLOWED_BRANCHES[decisionId].includes(branch)) fail(`${decisionId} branch is not allowed`);
    const decisionKeys = branch === "replacement" ? ["branch", "replacement_contract"] : ["branch"];
    assertExactKeys(decision, decisionKeys, decisionId);
    if (branch === "replacement" && (typeof decision.replacement_contract !== "string" || decision.replacement_contract.length < 20)) {
      fail(`${decisionId} replacement_contract must contain at least 20 characters`);
    }
    const signatures = record.approvals[decisionId];
    if (!Array.isArray(signatures) || signatures.length === 0) fail(`${decisionId} signatures are required`);
    for (const signature of signatures) {
      assertExactKeys(signature, ["signer_identity", "signer_role", "branch", "decided_at"], `${decisionId} signature`);
      const maker = makers.get(signature?.signer_identity);
      if (!maker) fail(`${decisionId} signer_identity is absent from decision_makers`);
      if (!maker.roles.includes(signature.signer_role)) {
        fail(`${decisionId} signer ${signature.signer_identity} did not declare role ${signature.signer_role}`);
      }
      if (signature.branch !== branch) fail(`${decisionId} signature branch does not equal the selected decision branch`);
      assertTimestamp(signature.decided_at, `${decisionId} signature decided_at`);
    }
    if (!rolesSatisfied(signatures, REQUIRED_ROLES[decisionId])) fail(`${decisionId} is missing a required signer role`);
    verifyDelegation(signatures, trustedMakers, decisionId);
  }

  if (record.decisions["DEC-03"].branch === "A" && record.legacy_cny_attestation !== CNY_ATTESTATION) {
    fail("DEC-03=A requires the exact legacy CNY attestation");
  }
  for (const key of [
    "frozen_authorities_remain_immutable",
    "approval_is_not_migration_reservation",
    "technical_gate_and_uat_are_separate"
  ]) {
    if (record.acknowledgements?.[key] !== true) fail(`acknowledgement ${key} must be true`);
  }
  assertExactKeys(record.acknowledgements, [
    "frozen_authorities_remain_immutable",
    "approval_is_not_migration_reservation",
    "technical_gate_and_uat_are_separate"
  ], "acknowledgements");

  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    proposal_sha256: proposalSha256,
    trusted_signer_directory_sha256: directorySha256
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
