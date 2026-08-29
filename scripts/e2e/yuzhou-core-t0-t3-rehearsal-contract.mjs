/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { verifyCoreT0T3RehearsalContract } from "../hr-cutover/verify-core-t0-t3-rehearsal-contract.mjs";

const root = resolve(import.meta.dirname, "../..");
const read = path => readFileSync(resolve(root, path), "utf8");
const contract = JSON.parse(read("scripts/hr-cutover/contracts/core-t0-t3-rehearsal-v1.json"));

test("core profile freezes the exact T0-T3 prefix and T3-T0 rollback", () => {
  const result = verifyCoreT0T3RehearsalContract(contract);
  assert.equal(result.status, "PASS");
  assert.equal(result.executionStatus, "SPEC_FROZEN");
  assert.equal(result.productionImport, "HOLD");
  assert.match(result.sha256, /^[0-9a-f]{64}$/u);
});

test("arbitrary subsets, reordering, T4/T5 reachability and false readiness fail closed", () => {
  const mutations = [
    draft => { draft.domainOrder = ["T0", "T1", "T2"]; },
    draft => { draft.domainOrder = ["T0", "T2", "T1", "T3"]; },
    draft => { draft.rollbackOrder = ["T2", "T3", "T1", "T0"]; },
    draft => { draft.forbiddenDomains = ["T5"]; },
    draft => { draft.sourceAuthority.requiresT4Evidence = true; },
    draft => { draft.sourceAuthority.requiresT5MaterializationKey = true; },
    draft => { draft.executionStatus = "READY"; },
    draft => { draft.productionImport = "GO"; }
  ];
  for (const mutate of mutations) {
    const draft = structuredClone(contract);
    mutate(draft);
    assert.throws(() => verifyCoreT0T3RehearsalContract(draft));
  }
});

test("machine package is v2, externally rooted and cannot reuse legacy human approval", () => {
  assert.deepEqual(contract.machineGate.requiredArtifactsPerRehearsal, ["decision", "private_payload", "machine_attestation"]);
  assert.equal(contract.machineGate.checkpointVersion, 2);
  assert.equal(contract.machineGate.trustedRootExternal, true);
  assert.equal(contract.machineGate.legacyV1Writable, false);
});

test("core contract retains independent A/B resources and 13-class zero residual", () => {
  assert.equal(contract.resourceIsolation.length, 12);
  assert.equal(contract.residualClasses.length, 13);
  assert.deepEqual(contract.requiredFinalState, { state: "cleaned", residualCount: 0 });
});

test("ordinary deploy remains unable to invoke any Yuzhou rehearsal or historical loader", () => {
  const deploy = read(".github/workflows/deploy-production.yml");
  assert.doesNotMatch(deploy, /core-t0-t3|full-domain-lifecycle|load-yuzhou|ALLOW_YUZHOU_MIGRATION|production-import-writer/u);
});
