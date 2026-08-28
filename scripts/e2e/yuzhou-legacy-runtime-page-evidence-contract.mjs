import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  LEGACY_RUNTIME_PAGE_SOURCE_CONTRACT_SHA256,
  legacyRuntimePageArtifactDescriptorHash,
  legacyRuntimePageObservationHash,
  verifyLegacyRuntimePageEvidence
} from "../hr-cutover/legacy-runtime-page-evidence-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = resolve(root, "scripts/hr-cutover/fixtures/legacy-runtime-page-evidence");
const clientPath = resolve(fixtureRoot, "valid-client-v1.json");
const groupWebPath = resolve(fixtureRoot, "valid-group-web-v1.json");
const load = path => JSON.parse(readFileSync(path, "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));
const rehash = manifest => {
  for (const observation of manifest.observations) observation.observationSha256 = legacyRuntimePageObservationHash(observation);
  return manifest;
};
const rejects = (manifest, code) => assert.throws(() => verifyLegacyRuntimePageEvidence(manifest), error => error?.code === code);

test("accepts independent client and group Web hash-only fixtures", () => {
  assert.deepEqual(verifyLegacyRuntimePageEvidence(load(clientPath)), {
    status: "PASS", surface: "client", observations: 1, fields: 1, actions: 1, states: 0, humanSignoff: "HOLD", productionImport: "HOLD"
  });
  assert.deepEqual(verifyLegacyRuntimePageEvidence(load(groupWebPath)), {
    status: "PASS", surface: "group_web", observations: 1, fields: 1, actions: 1, states: 0, humanSignoff: "HOLD", productionImport: "HOLD"
  });
});

test("surface source hashes bind the current authoritative traversal contracts", () => {
  const authorities = {
    client: resolve(root, "scripts/hr-cutover/contracts/legacy-client-live-traversal-v1.json"),
    group_web: resolve(root, "scripts/hr-cutover/contracts/legacy-group-web-live-runtime-v1.json")
  };
  for (const [surface, path] of Object.entries(authorities)) {
    assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), LEGACY_RUNTIME_PAGE_SOURCE_CONTRACT_SHA256[surface]);
  }
  const wrongSurfaceHash = clone(load(clientPath)); wrongSurfaceHash.sourceContractSha256 = LEGACY_RUNTIME_PAGE_SOURCE_CONTRACT_SHA256.group_web;
  rejects(wrongSurfaceHash, "LEGACY_RUNTIME_PAGE_EVIDENCE_SOURCE_CONTRACT_INVALID");
});

test("an observation cannot pass without field or action atomic evidence", () => {
  const emptyAtomicEvidence = clone(load(clientPath));
  emptyAtomicEvidence.observations[0].fieldEvidence = [];
  emptyAtomicEvidence.observations[0].actionEvidence = [];
  rejects(rehash(emptyAtomicEvidence), "LEGACY_RUNTIME_PAGE_EVIDENCE_ATOMIC_EVIDENCE_REQUIRED");
});

test("permission observation and direct-route verification are mandatory", () => {
  const unproven = clone(load(clientPath)); unproven.observations[0].permissionEvidence.observed = "unproven";
  rejects(rehash(unproven), "LEGACY_RUNTIME_PAGE_EVIDENCE_VALUE_INVALID");
  const routeUnchecked = clone(load(groupWebPath)); routeUnchecked.observations[0].permissionEvidence.directRouteChecked = false;
  rejects(rehash(routeUnchecked), "LEGACY_RUNTIME_PAGE_EVIDENCE_PERMISSION_UNVERIFIED");
});

test("surface identity is non-substitutable and binds group legacyId", () => {
  const substituted = clone(load(clientPath)); substituted.surface = "group_web"; substituted.sourceContractSha256 = LEGACY_RUNTIME_PAGE_SOURCE_CONTRACT_SHA256.group_web;
  rejects(substituted, "LEGACY_RUNTIME_PAGE_EVIDENCE_SURFACE_INVALID");
  const mismatchedLegacyId = clone(load(groupWebPath)); mismatchedLegacyId.observations[0].legacyId = 102;
  rejects(rehash(mismatchedLegacyId), "LEGACY_RUNTIME_PAGE_EVIDENCE_SURFACE_INVALID");
  const mismatchedDomain = clone(load(groupWebPath)); mismatchedDomain.observations[0].familyOrDomain = "payroll";
  rejects(rehash(mismatchedDomain), "LEGACY_RUNTIME_PAGE_EVIDENCE_SURFACE_INVALID");
});

test("stable page and atomic IDs are strict and duplicate cells fail closed", () => {
  const badField = clone(load(clientPath)); badField.observations[0].fieldEvidence[0].stableId = `${badField.observations[0].stableId}:action:employee-code`;
  rejects(rehash(badField), "LEGACY_RUNTIME_PAGE_EVIDENCE_STABLE_ID_INVALID");
  const duplicateCell = clone(load(clientPath)); duplicateCell.observations.push(clone(duplicateCell.observations[0]));
  rejects(duplicateCell, "LEGACY_RUNTIME_PAGE_EVIDENCE_DUPLICATE");
  const duplicateAction = clone(load(clientPath)); duplicateAction.observations[0].actionEvidence.push(clone(duplicateAction.observations[0].actionEvidence[0]));
  rejects(rehash(duplicateAction), "LEGACY_RUNTIME_PAGE_EVIDENCE_DUPLICATE");
});

test("raw values and unknown evidence properties are rejected", () => {
  const rawLabel = clone(load(clientPath)); rawLabel.observations[0].fieldEvidence[0].label = "raw-label";
  rejects(rawLabel, "LEGACY_RUNTIME_PAGE_EVIDENCE_SHAPE_INVALID");
  const username = clone(load(groupWebPath)); username.observations[0].username = "operator";
  rejects(username, "LEGACY_RUNTIME_PAGE_EVIDENCE_SHAPE_INVALID");
});

test("artifact descriptor, byte relation, and observation hash are immutable", () => {
  const descriptor = clone(load(clientPath)); descriptor.observations[0].artifact.descriptorSha256 = "a".repeat(64);
  rejects(rehash(descriptor), "LEGACY_RUNTIME_PAGE_EVIDENCE_ARTIFACT_INVALID");
  const bytes = clone(load(clientPath)); bytes.observations[0].artifact.bytes = 1; bytes.observations[0].artifact.descriptorSha256 = legacyRuntimePageArtifactDescriptorHash(bytes.observations[0].artifact);
  rejects(rehash(bytes), "LEGACY_RUNTIME_PAGE_EVIDENCE_ARTIFACT_INVALID");
  const observation = clone(load(clientPath)); observation.observations[0].viewport = "phone_390";
  rejects(observation, "LEGACY_RUNTIME_PAGE_EVIDENCE_HASH_INVALID");
});

test("read-only actions and state transitions can never claim execution", () => {
  const action = clone(load(clientPath)); action.observations[0].actionEvidence[0].executed = true;
  rejects(rehash(action), "LEGACY_RUNTIME_PAGE_EVIDENCE_ACTION_EXECUTED");
  const state = clone(load(clientPath));
  state.observations[0].stateEvidence.push({
    stableId: `${state.observations[0].stableId}:transition:draft:approved`,
    fromCodeSha256: "6".repeat(64), toCodeSha256: "7".repeat(64), source: "page_declared", executed: true
  });
  rejects(rehash(state), "LEGACY_RUNTIME_PAGE_EVIDENCE_STATE_EXECUTED");
});

test("read-only mode and both human/import HOLD gates are mandatory", () => {
  const writeMode = clone(load(clientPath)); writeMode.operationMode = "write";
  rejects(writeMode, "LEGACY_RUNTIME_PAGE_EVIDENCE_READ_ONLY_REQUIRED");
  const humanGo = clone(load(clientPath)); humanGo.humanSignoff = "GO";
  rejects(humanGo, "LEGACY_RUNTIME_PAGE_EVIDENCE_HOLD_REQUIRED");
  const importGo = clone(load(clientPath)); importGo.productionImport = "GO";
  rejects(importGo, "LEGACY_RUNTIME_PAGE_EVIDENCE_HOLD_REQUIRED");
});

test("sensitive values fail even when nested or encoded", () => {
  const credential = clone(load(clientPath)); credential.batchId = ["pass", "word=sample"].join("");
  rejects(credential, "LEGACY_RUNTIME_PAGE_EVIDENCE_SENSITIVE_CONTENT");
  const privateAddress = clone(load(clientPath)); privateAddress.batchId = ["192", "168", "9", "8"].join(".");
  rejects(privateAddress, "LEGACY_RUNTIME_PAGE_EVIDENCE_SENSITIVE_CONTENT");
  const encodedPath = clone(load(clientPath)); encodedPath.batchId = Buffer.from(["/Us", "ers/example/evidence"].join("")).toString("base64");
  rejects(encodedPath, "LEGACY_RUNTIME_PAGE_EVIDENCE_SENSITIVE_CONTENT");
  const personal = clone(load(clientPath)); personal.batchId = ["138", "0000", "0000"].join("");
  rejects(personal, "LEGACY_RUNTIME_PAGE_EVIDENCE_SENSITIVE_CONTENT");
});

test("schema preserves exact-shape, non-execution, and double-HOLD boundaries", () => {
  const schema = load(resolve(root, "scripts/hr-cutover/contracts/legacy-runtime-page-evidence.schema.json"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.operationMode.const, "read_only");
  assert.equal(schema.properties.humanSignoff.const, "HOLD");
  assert.equal(schema.properties.productionImport.const, "HOLD");
  assert.equal(schema.allOf[0].then.properties.sourceContractSha256.const, LEGACY_RUNTIME_PAGE_SOURCE_CONTRACT_SHA256.client);
  assert.equal(schema.allOf[0].else.properties.sourceContractSha256.const, LEGACY_RUNTIME_PAGE_SOURCE_CONTRACT_SHA256.group_web);
  assert.equal(schema.$defs.actionEvidence.properties.executed.const, false);
  assert.equal(schema.$defs.stateEvidence.properties.executed.const, false);
  assert.deepEqual(schema.$defs.permissionEvidence.properties.observed.enum, ["allow", "deny"]);
  assert.equal(schema.$defs.permissionEvidence.properties.directRouteChecked.const, true);
  assert.equal(schema.$defs.observation.additionalProperties, false);
});

test("CLI accepts only an absolute manifest path and emits a HOLD report", () => {
  const cli = resolve(root, "scripts/hr-cutover/verify-legacy-runtime-page-evidence.mjs");
  const valid = spawnSync(process.execPath, [cli, "--manifest", clientPath], { cwd: root, encoding: "utf8" });
  assert.equal(valid.status, 0, valid.stderr);
  const report = JSON.parse(valid.stdout);
  assert.equal(report.status, "PASS"); assert.equal(report.humanSignoff, "HOLD"); assert.equal(report.productionImport, "HOLD");
  const relative = spawnSync(process.execPath, [cli, "--manifest", "scripts/example.json"], { cwd: root, encoding: "utf8" });
  assert.notEqual(relative.status, 0); assert.match(relative.stderr, /LEGACY_RUNTIME_PAGE_EVIDENCE_CLI_ARGUMENT_INVALID/u);
});
