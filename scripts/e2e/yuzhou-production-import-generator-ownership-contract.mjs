/* global structuredClone */
import assert from "node:assert/strict";
import console from "node:console";
import { fixture, inputFor } from "./yuzhou-production-import-candidate-freeze-fixture.mjs";
import { freezeProductionImportCandidates } from "../hr-cutover/production-import-candidate-freeze.mjs";
import { generateProductionImportPayloads, computeFrozenArtifactHash } from "../hr-cutover/production-import-payload-generator.mjs";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
const frozen = freezeProductionImportCandidates(inputFor(fixture()));
assert.equal(frozen.summary.status, "READY");
const input = frozen.bridge.generatorInput;
const before = computeFrozenArtifactHash(input);
const full = generateProductionImportPayloads(deepFreeze(input));
// Captured before the allocation-only change: all output bytes remain stable.
assert.equal(computeFrozenArtifactHash(full), "dd0d931273710b794d7bf91777608276419e0a5eb950613f91032687c605a143");
const compact = generateProductionImportPayloads(input, { includeArtifactText: false });
const expected = structuredClone(full);
for (const bundle of expected.bundles) delete bundle.artifactText;
assert.deepEqual(compact, expected);
assert.equal(computeFrozenArtifactHash(input), before);
assert.throws(() => generateProductionImportPayloads(input, { includeArtifactText: "false" }), /PRODUCTION_IMPORT_FROZEN_ARTIFACT_INVALID/);
// Mutating outputs must never mutate frozen inputs or another invocation.
full.bundles[0].bundle.records[0].payload.org_code = "changed-output";
full.planPhases[0].records[0].sourceRowSha256 = "0".repeat(64);
assert.equal(computeFrozenArtifactHash(input), before);
assert.deepEqual(generateProductionImportPayloads(input, { includeArtifactText: false }), compact);
const mutableInput = structuredClone(input);
const detached = generateProductionImportPayloads(mutableInput, { includeArtifactText: false });
mutableInput.decisionsArtifact.content.records[0].targetFields.org_code = "changed-input";
mutableInput.stagingArtifact.content.records[0].sourceRowSha256 = "1".repeat(64);
assert.deepEqual(detached, compact);
console.log("PASS generator ownership, compact/full parity, pre-change output hash and invalid option");
