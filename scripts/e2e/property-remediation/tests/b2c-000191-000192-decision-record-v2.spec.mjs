import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../../../..");
const VALIDATOR = resolve(ROOT, "scripts/e2e/property-remediation/validate-b2c-000191-000192-decision-record-v2.mjs");
const PROPOSAL = resolve(ROOT, ".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000191-000192-contract-change-control-proposal-v2-20260803.md");
const IDS = ["DEC-01", "DEC-02", "DEC-03", "DEC-04", "DEC-05", "DEC-06"];
const identities = {
  "product-owner": "product@example",
  "finance-owner": "finance@example",
  "data-owner": "data@example",
  "homestay-domain-owner": "homestay@example",
  "housing-domain-owner": "housing@example",
  "audit-security-owner": "audit@example"
};

function signature(role, branch = "A") {
  return { signer_identity: identities[role], signer_role: role, branch, decided_at: "2026-08-03T17:00:00+08:00" };
}

function validDirectory() {
  return {
    authority_id: "property-b-change-control-test-directory",
    issued_at: "2026-08-03T16:59:00+08:00",
    issued_by: "test-authority@example",
    entries: Object.entries(identities).map(([role, identity]) => ({
      identity,
      roles: [role],
      evidence_reference: `test-fixture:${identity}`
    }))
  };
}

async function validRecord(directorySha256) {
  const proposalSha = createHash("sha256").update(await readFile(PROPOSAL)).digest("hex");
  return {
    proposal_sha256: proposalSha,
    trusted_signer_directory_sha256: directorySha256,
    decisions: Object.fromEntries(IDS.map((id) => [id, { branch: "A" }])),
    decision_makers: Object.entries(identities).map(([role, identity]) => ({ identity, roles: [role] })),
    approvals: {
      "DEC-01": [signature("product-owner"), signature("homestay-domain-owner"), signature("finance-owner")],
      "DEC-02": [signature("product-owner"), signature("finance-owner"), signature("data-owner")],
      "DEC-03": [signature("product-owner"), signature("finance-owner"), signature("data-owner")],
      "DEC-04": [signature("product-owner"), signature("housing-domain-owner"), signature("finance-owner")],
      "DEC-05": [signature("product-owner"), signature("housing-domain-owner"), signature("finance-owner"), signature("data-owner")],
      "DEC-06": [signature("product-owner"), signature("housing-domain-owner"), signature("finance-owner"), signature("audit-security-owner")]
    },
    decided_at: "2026-08-03T17:00:00+08:00",
    legacy_cny_attestation: "All legacy housing monetary data in scope may be interpreted and backfilled as CNY.",
    acknowledgements: {
      frozen_authorities_remain_immutable: true,
      approval_is_not_migration_reservation: true,
      technical_gate_and_uat_are_separate: true
    }
  };
}

async function runRecord(mutator = () => {}, directoryMutator = () => {}) {
  const directory = await mkdtemp(resolve(tmpdir(), "b2c-decision-v2-"));
  try {
    const signerDirectory = validDirectory();
    directoryMutator(signerDirectory);
    const directoryBytes = `${JSON.stringify(signerDirectory)}\n`;
    const directorySha = createHash("sha256").update(directoryBytes).digest("hex");
    const record = await validRecord(directorySha);
    mutator(record);
    const path = resolve(directory, "record.json");
    const signerDirectoryPath = resolve(directory, "trusted-directory.json");
    await writeFile(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    await writeFile(signerDirectoryPath, directoryBytes, { mode: 0o600 });
    return spawnSync(process.execPath, [VALIDATOR, path, signerDirectoryPath], { cwd: ROOT, encoding: "utf8" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("accepts a complete record bound to the current proposal", async () => {
  const result = await runRecord();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "PASS");
});

test("rejects signature branch drift", async () => {
  const result = await runRecord((record) => { record.approvals["DEC-01"][0].branch = "replacement"; });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /signature branch/);
});

test("rejects an unknown decision branch", async () => {
  const result = await runRecord((record) => {
    record.decisions["DEC-01"].branch = "unknown";
    for (const signature of record.approvals["DEC-01"]) signature.branch = "unknown";
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /branch is not allowed/);
});

test("rejects a signer absent from the declared directory", async () => {
  const result = await runRecord((record) => { record.approvals["DEC-01"][0].signer_identity = "absent@example"; });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /absent from decision_makers/);
});

test("rejects a missing required signer role", async () => {
  const result = await runRecord((record) => { record.approvals["DEC-01"].pop(); });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing a required signer role/);
});

test("rejects a signer role not declared by that identity", async () => {
  const result = await runRecord((record) => {
    record.approvals["DEC-01"][0].signer_role = "finance-owner";
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /did not declare role/);
});

test("rejects multi-role signing without explicit delegation", async () => {
  const result = await runRecord((record) => {
    const finance = record.decision_makers.find((maker) => maker.identity === identities["finance-owner"]);
    finance.roles.push("data-owner");
    record.approvals["DEC-02"][2] = { ...signature("data-owner"), signer_identity: finance.identity };
  }, (directory) => {
    const finance = directory.entries.find((maker) => maker.identity === identities["finance-owner"]);
    finance.roles.push("data-owner");
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /without a delegation_statement/);
});

test("accepts explicit delegation that names every represented role", async () => {
  const applyDelegation = (entries) => {
    const finance = entries.find((maker) => maker.identity === identities["finance-owner"]);
    finance.roles.push("data-owner");
    finance.delegation_statement = "Delegated confirmation for finance-owner and data-owner.";
  };
  const result = await runRecord((record) => {
    const finance = record.decision_makers.find((maker) => maker.identity === identities["finance-owner"]);
    finance.roles.push("data-owner");
    finance.delegation_statement = "Delegated confirmation for finance-owner and data-owner.";
    record.approvals["DEC-02"][2] = { ...signature("data-owner"), signer_identity: finance.identity };
  }, (directory) => applyDelegation(directory.entries));
  assert.equal(result.status, 0, result.stderr);
});

test("rejects delegation that omits one represented role", async () => {
  const result = await runRecord((record) => {
    const finance = record.decision_makers.find((maker) => maker.identity === identities["finance-owner"]);
    finance.roles.push("data-owner");
    finance.delegation_statement = "Delegated confirmation for finance-owner.";
    record.approvals["DEC-02"][2] = { ...signature("data-owner"), signer_identity: finance.identity };
  }, (directory) => {
    const finance = directory.entries.find((maker) => maker.identity === identities["finance-owner"]);
    finance.roles.push("data-owner");
    finance.delegation_statement = "Delegated confirmation for finance-owner.";
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not name role data-owner/);
});

test("rejects a self-declared role absent from the trusted signer directory", async () => {
  const result = await runRecord((record) => {
    const finance = record.decision_makers.find((maker) => maker.identity === identities["finance-owner"]);
    finance.roles.push("data-owner");
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /role absent from the trusted signer directory/);
});

test("rejects trusted-directory hash drift", async () => {
  const result = await runRecord((record) => { record.trusted_signer_directory_sha256 = "0".repeat(64); });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /trusted_signer_directory_sha256/);
});

test("rejects a trusted entry without evidence reference", async () => {
  const result = await runRecord(() => {}, (directory) => { delete directory.entries[0].evidence_reference; });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires evidence_reference/);
});

test("rejects a decision maker absent from the trusted signer directory", async () => {
  const result = await runRecord(() => {}, (directory) => {
    directory.entries = directory.entries.filter((entry) => entry.identity !== identities["product-owner"]);
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /absent from the trusted signer directory/);
});

test("rejects delegation drift between record and trusted directory", async () => {
  const result = await runRecord((record) => {
    const finance = record.decision_makers.find((maker) => maker.identity === identities["finance-owner"]);
    finance.delegation_statement = "Delegated confirmation for finance-owner.";
  }, (directory) => {
    const finance = directory.entries.find((maker) => maker.identity === identities["finance-owner"]);
    finance.delegation_statement = "Different delegation for finance-owner.";
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /delegation_statement differs/);
});

test("rejects a stale proposal hash and missing CNY attestation", async () => {
  const stale = await runRecord((record) => { record.proposal_sha256 = "0".repeat(64); });
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /proposal_sha256/);
  const noAttestation = await runRecord((record) => { delete record.legacy_cny_attestation; });
  assert.notEqual(noAttestation.status, 0);
  assert.match(noAttestation.stderr, /CNY attestation/);
});

test("rejects malformed replacement, unknown fields, and invalid timestamps", async () => {
  const replacement = await runRecord((record) => {
    record.decisions["DEC-01"] = { branch: "replacement" };
    for (const signature of record.approvals["DEC-01"]) signature.branch = "replacement";
  });
  assert.notEqual(replacement.status, 0);
  assert.match(replacement.stderr, /must contain exactly/);
  const unknown = await runRecord((record) => { record.unknown = true; });
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /unknown top-level field/);
  const timestamp = await runRecord((record) => { record.approvals["DEC-01"][0].decided_at = "2026-08-03"; });
  assert.notEqual(timestamp.status, 0);
  assert.match(timestamp.stderr, /RFC3339 timestamp/);
});
