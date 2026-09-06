import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, realpathSync, rmSync, symlinkSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture, inputFor, descriptor, decode, hash, quarantine } from "./yuzhou-production-import-candidate-freeze-fixture.mjs";
import { stableProductionImportCanonicalJson as canonical, computeProductionImportBusinessIdentityHash as businessHash,
  deriveProductionImportTargetId as deriveId } from "../hr-cutover/production-import-target-model.mjs";
import { prepareProductionImportExceptions as prepare, finalizeProductionImportExceptions as finalize } from "../hr-cutover/production-import-exception-preparation.mjs";
import { materializeProductionImportExceptionPreparation as materialize } from "../hr-cutover/materialize-production-import-exception-preparation.mjs";
import { freezeProductionImportCandidates as freeze } from "../hr-cutover/production-import-candidate-freeze.mjs";
import { generateProductionImportPayloads } from "../hr-cutover/production-import-payload-generator.mjs";
import { decryptProductionImportEnvelope } from "../hr-cutover/production-import-crypto-provider.mjs";
import { createProductionImportArtifactCryptoProvider } from "../hr-cutover/execute-production-import.mjs";
import { materializeProductionImportDelegatedAuthorization } from "../hr-cutover/materialize-production-import-delegated-authorization.mjs";
import { authorizeDelegatedProductionImport } from "../hr-cutover/production-import-delegated-authorization.mjs";
import { approvalPolicyHash, productionImportOperatorPublicKeyHash } from "../hr-cutover/production-import-approval-policy.mjs";
import { computeSealedProductionImportPlanHash, validateSealedProductionImportPlan, assertProductionImportExecutionActivated } from "../hr-cutover/production-import-sealed-plan-lib.mjs";

function setup(withChildOrg = false) {
  const f = fixture();
  if (withChildOrg) {
    const parent = f.records.find(row => row.targetTable === "sys_org"), child = structuredClone(parent);
    child.targetFields.org_code = "SYN-child-org";
    child.sourceIdentitySha256 = hash(`${child.sourceTable}\0${child.targetFields.org_code}`);
    child.sourcePkCanonical = `sha256:${child.sourceIdentitySha256}`; child.sourceRowSha256 = hash("synthetic child org row");
    child.expectedTargetId = deriveId({ targetScope: f.scope, targetTable: "sys_org", sourceIdentitySha256: child.sourceIdentitySha256 });
    child.dependencyRefs = [{ role: "parent_org", phase: "T0", sourceIdentitySha256: parent.sourceIdentitySha256, expectedTargetTable: "sys_org" }];
    child.businessIdentitySha256 = businessHash("sys_org", f.scope, child.targetFields, { parent_id: parent.expectedTargetId });
    f.records.splice(f.records.indexOf(parent) + 1, 0, child);
    const employee = f.records.find(row => row.targetTable === "hr_employee"), primaryOrg = employee.dependencyRefs.find(ref => ref.role === "primary_org");
    if (primaryOrg) primaryOrg.sourceIdentitySha256 = child.sourceIdentitySha256;
    else employee.dependencyRefs.push({ role: "primary_org", phase: "T0", sourceIdentitySha256: child.sourceIdentitySha256, expectedTargetTable: "sys_org" });
  }
  const candidate = quarantine(f, "hr_employee_insurance_item", true), freezeInput = inputFor(f);
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

test("actual private delegate and authorize producers bind nonempty crypto, all bridge payloads and one owner to a sealed HOLD plan", async t => {
  const s = setup(true), p = privateFixture(t, s), operator = generateKeyPairSync("ed25519");
  const preparedResult = await materialize(p.json("prepare-owner-config.json", p.config).path, p.options);
  const preparedDescriptor = { path: join(p.config.outputDir, "unsigned-exception-requests.json"), sha256: preparedResult.artifacts["unsigned-exception-requests.json"].sha256 };
  const prepared = JSON.parse(readFileSync(preparedDescriptor.path));
  const operatorKeyFile = p.bytes("synthetic-operator.pem", operator.privateKey.export({ type: "pkcs8", format: "pem" }));
  const delegatedConfig = { ...p.config, mode: "delegate", outputDir: p.out("delegated"), artifacts: { ...p.config.artifacts, prepared: preparedDescriptor,
    envelopes: { path: join(p.config.outputDir, "crypto-envelopes.json"), sha256: preparedResult.artifacts["crypto-envelopes.json"].sha256 }, operatorKeyFile } };
  const delegated = await materialize(p.json("delegate-config.json", delegatedConfig).path, p.options);
  assert.equal(delegated.status, "DELEGATED_INTEGRITY_VERIFIED"); assert.equal(delegated.ownerAuthorizationClaimed, false);
  const reviewedDescriptor = { path: join(delegatedConfig.outputDir, "reviewed-candidate-resolutions.json"), sha256: delegated.artifacts["reviewed-candidate-resolutions.json"].sha256 };
  const receiptDescriptor = { path: join(delegatedConfig.outputDir, "delegated-bridge-evidence.json"), sha256: delegated.artifacts["delegated-bridge-evidence.json"].sha256 };
  const reviewed = JSON.parse(readFileSync(reviewedDescriptor.path)), receipt = JSON.parse(readFileSync(receiptDescriptor.path));
  const confirmationSource = p.bytes("synthetic-confirmation.txt", "Synthetic owner explicitly delegates this test operation. Not a production approval.");
  const now = new Date("2026-09-06T01:00:00.000Z");
  const binding = { triple: s.f.triple, targetIdentitySha256: s.f.inventory.targetIdentitySha256, targetScopeSha256: s.f.scope.scopeSha256,
    finalRehearsalPairSha256: hash("synthetic pair"), manifestSha256: hash("synthetic manifest"), windowStartsAt: "2026-09-06T00:00:00.000Z", windowEndsAt: "2026-09-06T02:00:00.000Z" };
  const confirmation = { formatVersion: 1, artifactKind: "yuzhou_hr_single_owner_confirmation", provenance: "explicit_user_confirmation", decision: "AUTHORIZE_DELEGATED_OPERATION",
    ownerSubjectRefSha256: hash("one synthetic owner"), confirmationEvidenceSha256: confirmationSource.sha256, operatorSubjectRefSha256: hash("synthetic operator"),
    operatorPublicKeySha256: productionImportOperatorPublicKeyHash(operator.publicKey.export({ type: "spki", format: "pem" })),
    context: { operationId: s.input.operationId, binding, issuedAt: "2026-09-06T00:30:00.000Z", expiresAt: "2026-09-06T01:30:00.000Z", nonceSha256: hash("synthetic nonce"),
      preparationArtifacts: { preparedSha256: preparedDescriptor.sha256, reviewedSha256: reviewedDescriptor.sha256, bridgeEvidenceSha256: receiptDescriptor.sha256 },
      payloadBundleSha256: receipt.binding.generationEvidence.payloadBundleSha256 } };
  const authConfig = { formatVersion: 1, mode: "authorize", triple: s.f.triple, artifacts: { confirmation: p.json("owner-confirmation.json", confirmation), confirmationSource,
    prepared: preparedDescriptor, reviewed: reviewedDescriptor, bridgeEvidence: receiptDescriptor, operatorKeyFile }, outputDir: p.out("authorized") };
  const authResult = materializeProductionImportDelegatedAuthorization(p.json("authorize-config.json", authConfig).path, { ...p.options, now });
  const authorization = JSON.parse(readFileSync(join(authConfig.outputDir, "sealed-authorization.json")));
  assert.equal(authorization.approvalSet.length, 1); assert.equal(authorization.approvalSet[0].role, "accountable_owner");
  assert.equal(authorization.artifactSha256, authResult.artifacts["one-time-import-authorization.json"].sha256);
  assert.equal(JSON.stringify(authResult).includes(operatorKeyFile.path), false); assert.equal(JSON.stringify(authResult).includes(operatorKeyFile.sha256), false);
  const frozen = freeze({ ...s.input.freezeInput, reviewedDecisionsArtifact: descriptor(reviewed) }), generated = generateProductionImportPayloads(frozen.bridge.generatorInput);
  const phases = generated.planPhases.map((phase, index) => ({ ...phase, payloadBundleArtifactSha256: generated.bundles[index].payloadBundleArtifactSha256,
    payloadBundleSha256: generated.bundles[index].payloadBundleSha256, canonicalizationVersion: generated.bundles[index].bundle.canonicalizationVersion,
    beforeCanonicalSha256: hash(`synthetic before ${index}`), expectedAfterCanonicalSha256: hash(`synthetic after ${index}`) }));
  const plan = { formatVersion: 2, planKind: "yuzhou_hr_production_import_sealed_execution_plan", operationId: s.input.operationId, intent: "production_import", status: "SEALED",
    triple: s.f.triple, target: { environment: "production", alias: "synthetic-production", identitySha256: s.f.inventory.targetIdentitySha256 }, targetScope: s.f.scope,
    window: { startsAt: binding.windowStartsAt, endsAt: binding.windowEndsAt }, authorization, manifestSha256: binding.manifestSha256,
    finalRehearsalPair: { artifactSha256: binding.finalRehearsalPairSha256, triple: s.f.triple, rehearsals: ["A", "B"].map(rehearsal => ({ rehearsal, manifestSha256: hash(`synthetic ${rehearsal}`), cleanupAuditSha256: hash(`synthetic cleanup ${rehearsal}`), residualCount: 0 })) },
    phaseOrder: ["T0", "T1", "T2", "T3"], phases,
    rollback: { order: ["T3", "T2", "T1", "T0"], insert: "delete_operation_owned_target", merge: "encrypted_before_image_cas_restore", quarantine: "no_target_write", skipApproved: "no_target_write", residualCount: 0, canonicalHash: "EXACT" },
    sealing: { algorithm: "canonical-json-sha256-v1", sealedPlanSha256: "" }, productionImport: "HOLD" };
  plan.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(plan);
  assert.equal(validateSealedProductionImportPlan(plan, { now }).productionImport, "HOLD");
  const orgs = plan.phases[0].records.filter(record => record.plannedTargetTable === "sys_org");
  assert.deepEqual(orgs.map(record => record.dependencyMode), ["scope", "record_graph"]);
  assert.equal(orgs[1].dependencyRefs[0].sourceIdentitySha256, orgs[0].sourceIdentitySha256);
  assert.equal(plan.phases[0].records.find(record => record.plannedTargetTable === "hr_employee").dependencyRefs.find(ref => ref.role === "primary_org").sourceIdentitySha256, orgs[1].sourceIdentitySha256);
  assert.throws(() => assertProductionImportExecutionActivated(plan), { code: "PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE" });
  const provider = await createProductionImportArtifactCryptoProvider({ envelopeArtifact: JSON.parse(readFileSync(delegatedConfig.artifacts.envelopes.path)),
    keyFiles: [{ keyReferenceSha256: s.input.keyReferenceSha256, keyFile: p.config.artifacts.keyFile }], plan,
    payloadBundles: Object.fromEntries(generated.bundles.map(bundle => [bundle.phase, Buffer.from(bundle.artifactText)])), decryptEnvelope: decryptProductionImportEnvelope });
  try {
    const record = plan.phases.flatMap(phase => phase.records).find(row => row.disposition === "quarantine");
    assert.ok((await provider.encryptQuarantine({ phaseName: "T3", record, payload: prepared.records[0].binding.decision.targetFields })).ciphertext.length > 0);
  } finally { provider.destroy(); }
  for (const mutate of [value => value.authorization.approvalSet = [], value => value.authorization.approvalSet.push(value.authorization.approvalSet[0]),
    value => value.authorization.approvalSet[0].subjectRefSha256 = hash("wrong owner"), value => value.authorization.approvalSet[0].role = "hr_owner",
    value => delete value.authorization.approvalPolicy.confirmation.confirmationEvidenceSha256,
    value => value.authorization.approvalPolicy.confirmation.context.binding.triple.mappingContractHash = hash("wrong mapping"),
    value => value.authorization.approvalPolicy.confirmation.context.preparationArtifacts.reviewedSha256 = hash("replacement"),
    value => value.authorization.approvalPolicy.operatorAttestation.signatureBase64 = Buffer.alloc(64).toString("base64"),
    value => value.phases[0].payloadBundleSha256 = hash("other payload"), value => delete value.authorization.approvalPolicy]) {
    const changed = structuredClone(plan); mutate(changed); changed.sealing.sealedPlanSha256 = computeSealedProductionImportPlanHash(changed);
    assert.throws(() => validateSealedProductionImportPlan(changed, { now }));
  }
  const authInput = { confirmationArtifact: descriptor(confirmation), confirmationSourceArtifact: { ...confirmationSource, bytes: readFileSync(confirmationSource.path) },
    preparedArtifact: descriptor(prepared), reviewedArtifact: descriptor(reviewed), bridgeEvidenceArtifact: descriptor(receipt) };
  for (const mutate of [value => value.context.operationId = "yzprod-import-20260906T010000Z-aaaaaaaaaaaa", value => value.context.binding.triple.sourceSnapshotHash = hash("other source"),
    value => value.context.binding.targetIdentitySha256 = hash("other target"), value => value.context.binding.targetScopeSha256 = hash("other scope"),
    value => value.confirmationEvidenceSha256 = hash("missing provenance"), value => value.context.payloadBundleSha256.T0 = hash("other bundle"),
    ...["preparedSha256", "reviewedSha256", "bridgeEvidenceSha256"].map(key => value => value.context.preparationArtifacts[key] = hash("other artifact"))]) {
    assert.throws(() => authorizeDelegatedProductionImport({ ...authInput, confirmationArtifact: change(authInput.confirmationArtifact, mutate) }, { operatorSigningKey: operator.privateKey, now }), { code: "PRODUCTION_IMPORT_DELEGATION_INVALID" });
  }
  assert.throws(() => authorizeDelegatedProductionImport(authInput, { operatorSigningKey: operator.privateKey, now: new Date(confirmation.context.expiresAt) }));
  assert.equal(approvalPolicyHash(receipt), receiptDescriptor.sha256);
  for (const kind of ["source-hash", "key-mode", "key-symlink", "wrong-key", "read-budget", "output-budget", "occupied", "current-code"]) {
    const config = structuredClone(authConfig), options = { ...p.options, now };
    config.outputDir = p.out(`auth-negative-${kind}`);
    if (kind === "source-hash") config.artifacts.confirmationSource.sha256 = hash("wrong provenance bytes");
    if (kind === "key-mode") chmodSync(operatorKeyFile.path, 0o644);
    if (kind === "key-symlink") { const path = join(p.root, "operator-alias.pem"); symlinkSync(operatorKeyFile.path, path); config.artifacts.operatorKeyFile.path = path; }
    if (kind === "wrong-key") config.artifacts.operatorKeyFile = p.bytes("wrong-operator.pem", generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }));
    if (kind === "read-budget") options.maximumReadBytes = 100;
    if (kind === "output-budget") options.maximumOutputBytes = 100;
    if (kind === "occupied") writeFileSync(join(config.outputDir, "retained.txt"), "preserved", { mode: 0o600 });
    if (kind === "current-code") options.currentHead = () => "b".repeat(40);
    try { assert.throws(() => materializeProductionImportDelegatedAuthorization(p.json(`auth-negative-${kind}.json`, config).path, options), { code: "PRODUCTION_IMPORT_DELEGATED_AUTHORIZATION_FAILED" }); }
    finally { if (kind === "key-mode") chmodSync(operatorKeyFile.path, 0o600); }
    assert.equal(readdirSync(config.outputDir).includes("single-owner-authorization-receipt.json"), false);
  }
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
