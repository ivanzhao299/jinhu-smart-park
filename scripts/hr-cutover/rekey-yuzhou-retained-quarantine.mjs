/* global structuredClone: readonly */
import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { encryptProductionImportEnvelope, decryptProductionImportEnvelope } from "./production-import-crypto-provider.mjs";
import { computeProductionImportTargetScopeHash } from "./production-import-sealed-plan-lib.mjs";

const fail = () => { throw new Error("LAB_REKEY_INVALID"); };
const hash = v => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const operation = v => typeof v === "string" && /^yzprod-import-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(v);
const exact = (v, keys) => { if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join() !== [...keys].sort().join()) fail(); };
const artifact = operationId => ({ formatVersion: 1, artifactKind: "yuzhou_hr_production_import_crypto_envelopes", operationId, entries: [] });
function decode(e) {
  exact(e, ["algorithm", "keyReferenceSha256", "nonceHex", "authenticationTagHex", "ciphertextHex"]);
  for (const [k, length] of [["nonceHex", 24], ["authenticationTagHex", 32], ["ciphertextHex", null]]) {
    if (typeof e[k] !== "string" || !/^(?:[a-f0-9]{2})+$/u.test(e[k]) || e[k].length > 16 * 1024 * 1024 || (length && e[k].length !== length)) fail();
  }
  return { algorithm: e.algorithm, keyReferenceSha256: e.keyReferenceSha256, nonce: Buffer.from(e.nonceHex, "hex"), authenticationTag: Buffer.from(e.authenticationTagHex, "hex"), ciphertext: Buffer.from(e.ciphertextHex, "hex") };
}
const encode = e => ({ algorithm: e.algorithm, keyReferenceSha256: e.keyReferenceSha256, nonceHex: e.nonce.toString("hex"), authenticationTagHex: e.authenticationTag.toString("hex"), ciphertextHex: e.ciphertext.toString("hex") });

/** In-memory preparation only. No input mutation, file I/O, authority or pair execution. */
export async function rekeyYuzhouRetainedQuarantine(input, { resolveKey } = {}) {
  const keys = new Map();
  try {
    exact(input, ["preparedTriple", "operationId", "targetScope", "phases", "envelopes", "sides"]);
    exact(input.preparedTriple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
    if (!/^[a-f0-9]{40}$/u.test(input.preparedTriple.codeSha ?? "") || !hash(input.preparedTriple.sourceSnapshotHash) || !hash(input.preparedTriple.mappingContractHash)) fail();
    exact(input.targetScope, ["tenantId", "parkId", "scopeSha256"]);
    if (computeProductionImportTargetScopeHash(input.targetScope) !== input.targetScope.scopeSha256) fail();
    exact(input.sides, ["A", "B"]);
    for (const s of Object.values(input.sides)) { exact(s, ["operationId", "keyReferenceSha256"]); if (!operation(s.operationId) || !hash(s.keyReferenceSha256)) fail(); }
    if (!operation(input.operationId) || new Set([input.operationId, input.sides.A.operationId, input.sides.B.operationId]).size !== 3 || input.sides.A.keyReferenceSha256 === input.sides.B.keyReferenceSha256) fail();
    exact(input.envelopes, ["formatVersion", "artifactKind", "operationId", "entries"]);
    if (input.envelopes.formatVersion !== 1 || input.envelopes.artifactKind !== artifact().artifactKind || input.envelopes.operationId !== input.operationId || !Array.isArray(input.envelopes.entries)) fail();
    if (!Array.isArray(input.phases) || input.phases.length !== 4) fail();
    const rows = [], seen = new Set();
    for (const [i, p] of input.phases.entries()) {
      exact(p, ["phase", "records"]); if (p.phase !== `T${i}` || !Array.isArray(p.records)) fail();
      for (const r of p.records) {
        if (!["insert", "quarantine"].includes(r.disposition) || !hash(r.sourceIdentitySha256) || seen.has(r.sourceIdentitySha256)) fail();
        seen.add(r.sourceIdentitySha256);
        if (r.disposition === "quarantine") rows.push({ phaseName: p.phase, record: structuredClone(r) });
      }
    }
    if (!rows.length || rows.length !== input.envelopes.entries.length) fail();
    const entries = new Map();
    for (const e of input.envelopes.entries) {
      exact(e, ["kind", "phaseName", "sourceIdentitySha256", "envelope"]);
      if (e.kind !== "quarantine" || entries.has(e.sourceIdentitySha256)) fail();
      entries.set(e.sourceIdentitySha256, { phaseName: e.phaseName, envelope: decode(e.envelope) });
    }
    const scope = structuredClone(input.targetScope), sides = structuredClone(input.sides), preparedTriple = structuredClone(input.preparedTriple), sourceOperation = input.operationId;
    const sourceRefs = new Set(rows.map(r => r.record.quarantine?.keyReferenceSha256));
    for (const r of sourceRefs) if (!hash(r) || Object.values(sides).some(s => s.keyReferenceSha256 === r)) fail();
    for (const ref of [...sourceRefs, sides.A.keyReferenceSha256, sides.B.keyReferenceSha256]) {
      const k = await resolveKey({ keyReferenceSha256: ref }); if (!Buffer.isBuffer(k) || k.length !== 32) fail(); keys.set(ref, Buffer.from(k));
    }
    const a = keys.get(sides.A.keyReferenceSha256), b = keys.get(sides.B.keyReferenceSha256);
    if (timingSafeEqual(a, b) || [...sourceRefs].some(r => timingSafeEqual(keys.get(r), a) || timingSafeEqual(keys.get(r), b))) fail();
    const resolver = { resolveKey: async ({ keyReferenceSha256 }) => keys.get(keyReferenceSha256) };
    const output = Object.fromEntries(Object.entries(sides).map(([side, s]) => [side, { envelopes: artifact(s.operationId), overlays: [] }]));
    for (const { phaseName, record } of rows) {
      const entry = entries.get(record.sourceIdentitySha256); if (!entry || entry.phaseName !== phaseName) fail();
      const ctx = { kind: "quarantine", operationId: sourceOperation, phaseName, targetScope: scope, record, keyReferenceSha256: record.quarantine.keyReferenceSha256 };
      const plain = await decryptProductionImportEnvelope({ ...ctx, envelope: entry.envelope }, resolver);
      for (const [side, s] of Object.entries(sides)) {
        const next = { ...ctx, operationId: s.operationId, keyReferenceSha256: s.keyReferenceSha256 };
        const sealed = await encryptProductionImportEnvelope({ ...next, value: plain.payload }, resolver);
        const quarantine = { ...sealed.binding };
        const verified = await decryptProductionImportEnvelope({ ...next, record: { ...record, quarantine }, envelope: sealed.envelope }, resolver);
        if (verified.payloadSha256 !== record.payloadSha256) fail();
        output[side].envelopes.entries.push({ kind: "quarantine", phaseName, sourceIdentitySha256: record.sourceIdentitySha256, envelope: encode(sealed.envelope) });
        output[side].overlays.push({ phaseName, sourceIdentitySha256: record.sourceIdentitySha256, sourceRowSha256: record.sourceRowSha256, payloadSha256: record.payloadSha256, quarantine });
      }
    }
    return { preparedTriple, sides: output, summary: { status: "QUARANTINE_REKEY_PREPARED", quarantineCount: rows.length, sourceOperationPreserved: true, inputArtifactsModified: false, pairExecuted: false, formalABVerified: false, authorizationClaimed: false, productionImport: "HOLD" } };
  } catch { fail(); }
  finally { for (const key of keys.values()) key.fill(0); }
}
