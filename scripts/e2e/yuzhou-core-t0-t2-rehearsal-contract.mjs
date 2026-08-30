import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { coreProfile } from "../hr-cutover/core-t0-t3-rehearsal.mjs";
import { verifyCoreT0T2RehearsalContract } from "../hr-cutover/verify-core-t0-t2-rehearsal-contract.mjs";

const root = resolve(import.meta.dirname, "../..");
const contract = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/core-t0-t2-rehearsal-v1.json"), "utf8"));

test("T0-T2 prefix contract is frozen and matches the executable profile", () => {
  const result = verifyCoreT0T2RehearsalContract(contract);
  assert.equal(result.status, "PASS");
  assert.deepEqual(coreProfile(contract.profile).domainOrder, contract.domainOrder);
  assert.deepEqual(coreProfile(contract.profile).rollbackOrder, contract.rollbackOrder);
  assert.equal(result.productionImport, "HOLD");
});

test("T3/T4/T5 injection, reordering and false readiness fail closed", () => {
  for (const mutate of [draft => { draft.domainOrder.push("T3"); }, draft => { draft.rollbackOrder = ["T1", "T2", "T0"]; }, draft => { draft.forbiddenDomains = ["T4", "T5"]; }, draft => { draft.executionStatus = "READY"; }, draft => { draft.productionImport = "GO"; }]) {
    const draft = structuredClone(contract); mutate(draft);
    assert.throws(() => verifyCoreT0T2RehearsalContract(draft));
  }
});
