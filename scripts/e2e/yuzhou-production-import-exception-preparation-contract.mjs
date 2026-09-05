import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, realpathSync, rmSync, symlinkSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture, inputFor, descriptor, decode, hash, quarantine } from "./yuzhou-production-import-candidate-freeze-fixture.mjs";
import { stableProductionImportCanonicalJson as canonical } from "../hr-cutover/production-import-target-model.mjs";
import { prepareProductionImportExceptions as prepare, finalizeProductionImportExceptions as finalize } from "../hr-cutover/production-import-exception-preparation.mjs";
import { materializeProductionImportExceptionPreparation as materialize } from "../hr-cutover/materialize-production-import-exception-preparation.mjs";
import { freezeProductionImportCandidates as freeze } from "../hr-cutover/production-import-candidate-freeze.mjs";
import { generateProductionImportPayloads } from "../hr-cutover/production-import-payload-generator.mjs";
import { decryptProductionImportEnvelope } from "../hr-cutover/production-import-crypto-provider.mjs";
import { createProductionImportArtifactCryptoProvider } from "../hr-cutover/execute-production-import.mjs";

function setup() {
  const f = fixture(), candidate = quarantine(f, "hr_employee_insurance_item", true), freezeInput = inputFor(f);
  const bindings = { triple: f.triple, phaseArtifactSha256: Object.fromEntries(Object.entries(freezeInput.phaseArtifacts).map(([phase, artifact]) => [phase, artifact.sha256])),
    candidateArtifactSha256: Object.fromEntries(Object.entries(freezeInput.candidateArtifacts).map(([phase, artifact]) => [phase, artifact.sha256])),
    targetInventoryArtifactSha256: freezeInput.targetInventoryArtifact.sha256, targetScopeArtifactSha256: freezeInput.targetScopeArtifact.sha256 };
  const choices = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_quarantine_choices", bindings,
    records: [{ phase: candidate.phase, targetTable: candidate.targetTable, sourceIdentitySha256: candidate.sourceIdentitySha256, sourceRowSha256: candidate.sourceRowSha256,
      reasonCode: candidate.reasonCode, targetFields: { contribution_base: "12.34", legacy_base_negative: false, remark: " Synthetic retained projection " }, dependencyRefs: [] }] };
  const key = randomBytes(32), input = { freezeInput, choicesArtifact: descriptor(choices), operationId: "yzprod-import-20260906T000000Z-aaaaaaaaaaaa", keyReferenceSha256: hash("synthetic external key reference") };
  return { f, input, candidate, key, options: { resolveKey: async () => key } };
}
function external(prepared) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519"), pem = publicKey.export({ type: "spki", format: "pem" });
  const preparedArtifact = descriptor(prepared);
  const attestations = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_external_exception_attestations", preparedArtifactSha256: preparedArtifact.sha256,
    records: prepared.records.map(({ candidate, binding }) => ({ sourceIdentitySha256: candidate.sourceIdentitySha256,
      attestationBase64: Buffer.from(canonical({ binding, publicKeyPem: pem, signatureBase64: sign(null, Buffer.from(canonical(binding)), privateKey).toString("base64") })).toString("base64") })) };
  return { preparedArtifact, attestationsArtifact: descriptor(attestations), reviewersArtifact: descriptor({ formatVersion: 1, artifactKind: "yuzhou_hr_production_import_external_reviewer_keys",
    publicKeys: [{ publicKeySha256: hash(publicKey.export({ type: "spki", format: "der" })), publicKeyPem: pem }] }) };
}
const reject = promise => assert.rejects(promise, error => /^EXCEPTION_PREPARATION_[A-Z_]+$/u.test(error.code) && error.message === error.code);
const change = (artifact, mutate) => { const value = decode(artifact); mutate(value); return descriptor(value); };
function privateFixture(t, s) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "yz-exception-synthetic-"))); chmodSync(root, 0o700);
  t.after(() => { s.key.fill(0); rmSync(root, { recursive: true, force: true }); });
  const bytes = (name, content) => { const path = join(root, name); writeFileSync(path, content, { mode: 0o600, flag: "wx" }); return { path, sha256: hash(content) }; };
  const json = (name, value) => bytes(name, canonical(value) + "\n");
  const writeArtifact = (name, artifact) => bytes(name, artifact.bytes);
  const out = name => { const path = join(root, name); mkdirSync(path, { mode: 0o700 }); return path; };
  const config = { formatVersion: 1, mode: "prepare", triple: s.f.triple, operationId: s.input.operationId, keyReferenceSha256: s.input.keyReferenceSha256,
    artifacts: { phases: Object.fromEntries(Object.entries(s.input.freezeInput.phaseArtifacts).map(([phase, artifact]) => [phase, writeArtifact(`${phase}-phase.json`, artifact)])),
      candidates: Object.fromEntries(Object.entries(s.input.freezeInput.candidateArtifacts).map(([phase, artifact]) => [phase, writeArtifact(`${phase}-candidates.json`, artifact)])),
      targetScope: writeArtifact("scope.json", s.input.freezeInput.targetScopeArtifact), targetInventory: writeArtifact("inventory.json", s.input.freezeInput.targetInventoryArtifact),
      choices: writeArtifact("choices.json", s.input.choicesArtifact), keyFile: bytes("external-key.bin", s.key) }, outputDir: out("prepared") };
  return { root, config, bytes, json, out, options: { currentHead: () => s.f.triple.codeSha } };
}
test("private prepare -> external Ed25519 signature -> finalize -> freeze -> actual execution crypto retains nonempty normalized payload and original envelope", async t => {
  const s = setup(), p = privateFixture(t, s), inputBefore = structuredClone(s.input);
  const result = await materialize(p.json("prepare-config.json", p.config).path, p.options);
  assert.equal(result.status, "AWAITING_EXTERNAL_SIGNATURES"); assert.equal(result.productionImport, "HOLD");
  const prepared = JSON.parse(readFileSync(join(p.config.outputDir, "unsigned-exception-requests.json"))), envelopes = JSON.parse(readFileSync(join(p.config.outputDir, "crypto-envelopes.json")));
  const payload = prepared.records[0].binding.decision.targetFields;
  assert.deepEqual(payload, { contribution_base: "12.34", legacy_base_negative: false, remark: " Synthetic retained projection " });
  assert.deepEqual(prepared.records[0].candidate, s.candidate);
  assert.deepEqual(prepared.records[0].binding.decision.dependencyRefs, []);
  assert.equal(prepared.approvalClaimed, false);
  const signed = external(prepared), finalConfig = { ...p.config, mode: "finalize", outputDir: p.out("finalized"), artifacts: { ...p.config.artifacts,
    prepared: { path: join(p.config.outputDir, "unsigned-exception-requests.json"), sha256: result.artifacts["unsigned-exception-requests.json"].sha256 },
    envelopes: { path: join(p.config.outputDir, "crypto-envelopes.json"), sha256: result.artifacts["crypto-envelopes.json"].sha256 },
    attestations: p.bytes("external-attestations.json", signed.attestationsArtifact.bytes), reviewerKeys: p.bytes("pinned-reviewers.json", signed.reviewersArtifact.bytes) } };
  const final = await materialize(p.json("finalize-config.json", finalConfig).path, p.options);
  assert.equal(final.signatureVerifiedAgainstProvidedKeys, true); assert.equal(final.signerAuthorityEstablished, false); assert.equal(final.productionImport, "HOLD");
  const reviewed = JSON.parse(readFileSync(join(finalConfig.outputDir, "reviewed-candidate-resolutions.json")));
  const frozen = freeze({ ...s.input.freezeInput, reviewedDecisionsArtifact: descriptor(reviewed) }), generated = generateProductionImportPayloads(frozen.bridge.generatorInput);
  const provider = await createProductionImportArtifactCryptoProvider({ envelopeArtifact: envelopes, keyFiles: [{ keyReferenceSha256: s.input.keyReferenceSha256, keyFile: p.config.artifacts.keyFile }],
    plan: { operationId: s.input.operationId, targetScope: s.f.scope, phases: generated.planPhases },
    payloadBundles: Object.fromEntries(generated.bundles.map(bundle => [bundle.phase, Buffer.from(bundle.artifactText)])), decryptEnvelope: decryptProductionImportEnvelope });
  try {
    const record = generated.planPhases.flatMap(phase => phase.records).find(row => row.disposition === "quarantine");
    const retained = await provider.encryptQuarantine({ phaseName: "T3", record, payload });
    for (const [binary, hex] of [["nonce", "nonceHex"], ["authenticationTag", "authenticationTagHex"], ["ciphertext", "ciphertextHex"]]) assert.equal(retained[binary].toString("hex"), envelopes.entries[0].envelope[hex]);
  } finally { provider.destroy(); }
  assert.deepEqual(s.input, inputBefore);
  assert.equal(JSON.stringify(result).includes(p.config.artifacts.keyFile.path), false);
  assert.equal(JSON.stringify(final).includes(p.config.artifacts.keyFile.sha256), false);
  assert.deepEqual(readdirSync(finalConfig.outputDir).sort(), ["exception-preparation-receipt.json", "reviewed-candidate-resolutions.json"]);
});
test("unsigned preparation is not reviewed evidence; invalid explicit choices fail before key access", async () => {
  const s = setup(); let reads = 0;
  try {
    for (const mutate of [value => value.records.pop(), value => value.records.push(value.records[0]), value => value.records[0].sourceRowSha256 = hash("wrong"),
      value => value.records[0].reasonCode = "INVENTED", value => value.records[0].targetFields.secret = "not allowed", value => value.records[0].dependencyRefs = s.candidate.dependencyRefs,
      value => value.bindings.triple.codeSha = "b".repeat(40)]) {
      await reject(prepare({ ...s.input, choicesArtifact: change(s.input.choicesArtifact, mutate) }, { resolveKey: async () => { reads++; return s.key; } }));
    }
    assert.equal(reads, 0);
    const out = await prepare(s.input, s.options);
    assert.throws(() => freeze({ ...s.input.freezeInput, reviewedDecisionsArtifact: descriptor(out.prepared) }));
  } finally { s.key.fill(0); }
});
test("finalize rejects missing/extra/duplicate reviews, unpinned signer, tampered decision/context and wrong key", async () => {
  const s = setup();
  try {
    const out = await prepare(s.input, s.options), input = { ...s.input, ...external(out.prepared), envelopesArtifact: descriptor(out.envelopes) };
    assert.equal((await finalize(input, s.options)).summary.recordCount, 1);
    for (const mutate of [value => value.records.pop(), value => value.records.push(value.records[0]), value => value.records[0].sourceIdentitySha256 = hash("extra")]) await reject(finalize({ ...input, attestationsArtifact: change(input.attestationsArtifact, mutate) }, s.options));
    await reject(finalize({ ...input, reviewersArtifact: external(out.prepared).reviewersArtifact }, s.options));
    await reject(finalize(input, { resolveKey: async () => Buffer.alloc(32) }));
    for (const mutate of [value => value.records[0].binding.decision.targetFields.remark = "tampered", value => value.operationId = "yzprod-import-20260906T010000Z-aaaaaaaaaaaa",
      value => value.targetScope.parkId = "wrong", value => value.records[0].candidate.sourceRowSha256 = hash("wrong"),
      value => value.bindings.candidateArtifactSha256.T3 = hash("wrong"), value => value.bindings.targetInventoryArtifactSha256 = hash("wrong"), value => value.bindings.triple.mappingContractHash = hash("wrong")]) {
      await reject(finalize({ ...input, preparedArtifact: change(input.preparedArtifact, mutate) }, s.options));
    }
    await reject(finalize({ ...input, envelopesArtifact: change(input.envelopesArtifact, value => value.entries[0].envelope.authenticationTagHex = "00".repeat(16)) }, s.options));
    const changed = decode(input.attestationsArtifact), attestation = JSON.parse(Buffer.from(changed.records[0].attestationBase64, "base64"));
    attestation.signatureBase64 = Buffer.alloc(64).toString("base64"); changed.records[0].attestationBase64 = Buffer.from(canonical(attestation)).toString("base64");
    await reject(finalize({ ...input, attestationsArtifact: descriptor(changed) }, s.options));
  } finally { s.key.fill(0); }
});
test("fresh external signatures cannot bless a corrupt GCM tag, altered plaintext choice or mismatched crypto scope", async () => {
  const s = setup();
  try {
    const out = await prepare(s.input, s.options);
    for (const kind of ["tag", "payload", "scope"]) {
      const prepared = structuredClone(out.prepared), envelopes = structuredClone(out.envelopes), choice = decode(s.input.choicesArtifact);
      if (kind === "tag") {
        prepared.records[0].binding.cryptoEnvelope.authenticationTagBase64 = Buffer.alloc(16).toString("base64");
        envelopes.entries[0].envelope.authenticationTagHex = "00".repeat(16);
      }
      if (kind === "payload") {
        prepared.records[0].binding.decision.targetFields.remark = "different explicit payload";
        choice.records[0].targetFields.remark = "different explicit payload";
      }
      if (kind === "scope") { prepared.targetScope.parkId = "other scope"; prepared.records[0].binding.targetScope = prepared.targetScope; }
      const choicesArtifact = descriptor(choice), envelopesArtifact = descriptor(envelopes);
      prepared.choicesArtifactSha256 = choicesArtifact.sha256; prepared.envelopeArtifactSha256 = envelopesArtifact.sha256;
      await reject(finalize({ ...s.input, choicesArtifact, envelopesArtifact, ...external(prepared) }, s.options));
    }
  } finally { s.key.fill(0); }
});
test("private key allocations are zeroed after success and post-key failure", async t => {
  const s = setup(), p = privateFixture(t, s), keyBuffers = [], original = Buffer.alloc;
  t.mock.method(Buffer, "alloc", (size, ...args) => { const value = original(size, ...args); if (size === 32) keyBuffers.push(value); return value; });
  await materialize(p.json("success-config.json", p.config).path, p.options);
  const failure = { ...p.config, outputDir: p.out("failure") };
  await reject(materialize(p.json("failure-config.json", failure).path, { ...p.options, maximumOutputBytes: 100 }));
  assert.ok(keyBuffers.length >= 2); assert.ok(keyBuffers.every(value => value.every(byte => byte === 0)));
});
for (const kind of ["key-mode", "key-symlink", "key-hardlink", "short-key", "hash", "read-budget", "output-budget", "occupied", "current-code"]) test(`private IO rejects ${kind} without receipt`, async t => {
  const s = setup(), p = privateFixture(t, s), options = { ...p.options };
  if (kind === "key-mode") chmodSync(p.config.artifacts.keyFile.path, 0o644);
  if (kind === "key-symlink") { const path = join(p.root, "key-alias"); symlinkSync(p.config.artifacts.keyFile.path, path); p.config.artifacts.keyFile.path = path; }
  if (kind === "key-hardlink") linkSync(p.config.artifacts.keyFile.path, join(p.root, "key-link"));
  if (kind === "short-key") p.config.artifacts.keyFile = p.bytes("short-key.bin", Buffer.alloc(31));
  if (kind === "hash") p.config.artifacts.choices.sha256 = hash("wrong");
  if (kind === "read-budget") options.maximumReadBytes = 100;
  if (kind === "output-budget") options.maximumOutputBytes = 100;
  if (kind === "occupied") writeFileSync(join(p.config.outputDir, "retained.txt"), "preserve", { mode: 0o600 });
  if (kind === "current-code") options.currentHead = () => "b".repeat(40);
  await reject(materialize(p.json("config.json", p.config).path, options));
  assert.equal(readdirSync(p.config.outputDir).includes("exception-preparation-receipt.json"), false);
});
