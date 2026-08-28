import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  YuzhouLiveRoleUatBrowserRunnerError,
  assertTechnicalUatBrowserResultBinding,
  buildTechnicalUatBrowserBinding
} from "../hr-cutover/yuzhou-live-role-uat-browser-runner.mjs";

const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: "2".repeat(64), mappingContractHash: "3".repeat(64) };
const config = { rehearsal: "A", runId: "yzfull-technical-browser-rA", triple };
const usernames = { hrReviewer: "isolated-hr-reviewer", manager: "isolated-manager", employee: "isolated-employee" };
const hash = value => createHash("sha256").update(value).digest("hex");

test("full-domain technical UAT constructs three distinct immutable browser actor bindings", () => {
  const binding = buildTechnicalUatBrowserBinding(config, usernames);
  assert.deepEqual(Object.keys(binding.actorSubjectHashes).sort(), ["employee", "hr_reviewer", "manager"]);
  assert.equal(new Set(Object.values(binding.actorSubjectHashes)).size, 3);
  assert.ok(Object.values(binding.actorSubjectHashes).every(value => /^[0-9a-f]{64}$/u.test(value)));
  assert.ok(Object.values(binding.actorSubjectHashes).every(value => !Object.values(usernames).includes(value)));
  assert.deepEqual(binding.triple, triple);
});

test("duplicate or missing isolated browser actors fail before handoff", () => {
  assert.throws(
    () => buildTechnicalUatBrowserBinding(config, { ...usernames, employee: usernames.manager }),
    error => error instanceof YuzhouLiveRoleUatBrowserRunnerError && error.code === "TECHNICAL_UAT_BROWSER_ACTORS_INVALID"
  );
  assert.throws(
    () => buildTechnicalUatBrowserBinding(config, { ...usernames, employee: "" }),
    error => error instanceof YuzhouLiveRoleUatBrowserRunnerError && error.code === "TECHNICAL_UAT_BROWSER_ACTORS_INVALID"
  );
});

test("technical browser result stays bound while human UAT and production import remain HOLD", () => {
  const binding = buildTechnicalUatBrowserBinding(config, usernames);
  const result = {
    status: "PASS", humanAttestation: "HOLD", productionImport: "HOLD",
    runId: binding.runId, rehearsal: binding.rehearsal, triple: { ...binding.triple },
    observations: Object.entries(binding.actorSubjectHashes).map(([actor, actorSubjectHash]) => ({
      actor, actorSubjectHash, runId: binding.runId, rehearsal: binding.rehearsal, triple: { ...binding.triple }
    })),
    sessionCleanupProofs: Object.entries(binding.actorSubjectHashes).flatMap(([actor, actorSubjectHash]) => ["desktop", "phone_390"].map(viewportId => {
      const proof = { runId: binding.runId, rehearsal: binding.rehearsal, triple: { ...binding.triple }, actor, actorSubjectHash, viewportId, localStorageEntries: 0, sessionStorageEntries: 0, cookieEntries: 0, sensitiveDomMatches: 0, status: "PASS" };
      return { ...proof, proofSha256: hash(JSON.stringify(proof)) };
    }))
  };
  result.sessionCleanupProofsSha256 = hash(JSON.stringify(result.sessionCleanupProofs));
  assert.equal(assertTechnicalUatBrowserResultBinding(result, binding), result);

  for (const mutate of [
    draft => { draft.humanAttestation = "PASS"; },
    draft => { draft.productionImport = "GO"; },
    draft => { draft.triple.mappingContractHash = "4".repeat(64); },
    draft => { draft.observations[0].actorSubjectHash = "5".repeat(64); },
    draft => { draft.observations = []; },
    draft => { draft.sessionCleanupProofs[0].cookieEntries = 1; },
    draft => { draft.sessionCleanupProofsSha256 = "6".repeat(64); }
  ]) {
    const draft = structuredClone(result);
    mutate(draft);
    assert.throws(() => assertTechnicalUatBrowserResultBinding(draft, binding), YuzhouLiveRoleUatBrowserRunnerError);
  }
});
