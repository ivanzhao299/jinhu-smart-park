/* global structuredClone: readonly */
import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { rekeyYuzhouRetainedQuarantine } from "../hr-cutover/rekey-yuzhou-retained-quarantine.mjs";
import { encryptProductionImportEnvelope, decryptProductionImportEnvelope } from "../hr-cutover/production-import-crypto-provider.mjs";
import { computeProductionImportPayloadHash, computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
const h = s => createHash("sha256").update(s).digest("hex");
async function fixture() {
  const refs = [h("source"), h("a"), h("b")], keys = new Map(refs.map((r, i) => [r, Buffer.alloc(32, i + 1)]));
  const resolveKey = async ({ keyReferenceSha256 }) => keys.get(keyReferenceSha256);
  const operationId = "yzprod-import-20260909T000000Z-aaaaaaaaaaaa";
  const targetScope = { tenantId: "tenant", parkId: "park" }; targetScope.scopeSha256 = computeProductionImportTargetScopeHash(targetScope);
  const payload = { remark: null, value: "synthetic only" };
  const record = { disposition: "quarantine", sourceSystem: "yuzhou-v10", sourceTable: "dbo.departmentcode", plannedTargetTable: "sys_org", sourceIdentitySha256: h("id"), sourceRowSha256: h("row"), payloadSha256: computeProductionImportPayloadHash(payload) };
  const encrypted = await encryptProductionImportEnvelope({ kind: "quarantine", operationId, targetScope, phaseName: "T0", record, keyReferenceSha256: refs[0], value: payload }, { resolveKey });
  record.quarantine = { ...encrypted.binding, reasonCode: "SYNTHETIC" };
  const e = encrypted.envelope;
  const input = { preparedTriple: { codeSha: "a".repeat(40), sourceSnapshotHash: h("snapshot"), mappingContractHash: h("mapping") }, operationId, targetScope,
    phases: ["T0", "T1", "T2", "T3"].map(phase => ({ phase, records: phase === "T0" ? [record, { disposition: "insert", sourceIdentitySha256: h("insert") }] : [] })),
    envelopes: { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_crypto_envelopes", operationId, entries: [{ kind: "quarantine", phaseName: "T0", sourceIdentitySha256: record.sourceIdentitySha256, envelope: { algorithm: e.algorithm, keyReferenceSha256: refs[0], nonceHex: e.nonce.toString("hex"), authenticationTagHex: e.authenticationTag.toString("hex"), ciphertextHex: e.ciphertext.toString("hex") } }] },
    sides: { A: { operationId: operationId.replace(/a+$/, "bbbbbbbbbbbb"), keyReferenceSha256: refs[1] }, B: { operationId: operationId.replace(/a+$/, "cccccccccccc"), keyReferenceSha256: refs[2] } } };
  return { input, keys, refs, resolveKey, payload, record };
}
test("real GCM rekey emits only quarantine overlays and provider-format ciphertext with independently verified payload", async () => {
  const f = await fixture(), before = JSON.stringify(f.input), out = await rekeyYuzhouRetainedQuarantine(f.input, f);
  assert.equal(JSON.stringify(f.input), before); assert.deepEqual(out.preparedTriple, f.input.preparedTriple);
  assert.equal(out.summary.formalABVerified, false); assert.equal(out.summary.quarantineCount, 1);
  for (const side of ["A", "B"]) {
    const s = out.sides[side], e = s.envelopes.entries[0].envelope;
    assert.equal(s.overlays.length, 1); assert.equal(s.envelopes.operationId, f.input.sides[side].operationId);
    const result = await decryptProductionImportEnvelope({ kind: "quarantine", operationId: s.envelopes.operationId, phaseName: "T0", targetScope: f.input.targetScope, record: { ...f.record, quarantine: s.overlays[0].quarantine }, keyReferenceSha256: e.keyReferenceSha256,
      envelope: { algorithm: e.algorithm, keyReferenceSha256: e.keyReferenceSha256, nonce: Buffer.from(e.nonceHex, "hex"), authenticationTag: Buffer.from(e.authenticationTagHex, "hex"), ciphertext: Buffer.from(e.ciphertextHex, "hex") } }, f);
    assert.deepEqual(result.payload, f.payload);
  }
  assert.notEqual(out.sides.A.envelopes.entries[0].envelope.ciphertextHex, out.sides.B.envelopes.entries[0].envelope.ciphertextHex);
  assert.equal(JSON.stringify(out).includes("synthetic only"), false);
  assert.equal(f.keys.get(f.refs[0])[0], 1);
});
for (const [name, mutate] of [
  ["same actual AB key with different refs", f => f.keys.set(f.refs[2], Buffer.from(f.keys.get(f.refs[1])))],
  ["same actual source key with new ref", f => f.keys.set(f.refs[1], Buffer.from(f.keys.get(f.refs[0])))],
  ["same operation", f => f.input.sides.A.operationId = f.input.operationId],
  ["same reference", f => f.input.sides.A.keyReferenceSha256 = f.refs[0]],
  ["missing envelope", f => f.input.envelopes.entries.pop()],
  ["extra envelope", f => f.input.envelopes.entries.push(structuredClone(f.input.envelopes.entries[0]))],
  ["duplicate record", f => f.input.phases[0].records.push(f.input.phases[0].records[0])],
  ["wrong source row", f => f.input.phases[0].records[0].sourceRowSha256 = h("wrong")],
  ["wrong payload", f => f.input.phases[0].records[0].payloadSha256 = h("wrong")],
  ["tampered AAD", f => f.input.operationId = f.input.envelopes.operationId = f.input.operationId.replace("000000", "010000")],
  ["wrong scope", f => f.input.targetScope.parkId = "other"],
  ["wrong phase", f => f.input.envelopes.entries[0].phaseName = "T1"],
  ["unsupported merge", f => f.input.phases[0].records[1].disposition = "merge"],
  ["malicious resolver", f => f.resolveKey = async () => { throw new Error("PRIVATE CONTENT"); }],
]) test(`reject ${name} with safe fixed error`, async () => {
  const f = await fixture(); mutate(f); await assert.rejects(rekeyYuzhouRetainedQuarantine(f.input, f), /^Error: LAB_REKEY_INVALID$/);
});
