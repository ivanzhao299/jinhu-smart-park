/* global structuredClone: readonly */
import { Buffer } from "node:buffer";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { rekeyYuzhouRetainedQuarantine } from "./rekey-yuzhou-retained-quarantine.mjs";
import { prepareYuzhouRealBundleLabArtifacts } from "./yuzhou-real-bundle-lab-artifacts.mjs";
import { computeProductionImportPayloadHash } from "./production-import-sealed-plan-lib.mjs";
import { readProductionImportPrivateBytes as read, productionImportPrivateDirectory as directory,
  parseProductionImportPrivateJson as parse, measureProductionImportPrivateJson as measure,
  emitProductionImportPrivateArtifacts as emit } from "./materialize-production-import-frozen-decisions.mjs";

const LIMIT = 256 * 1024 * 1024;
const fail = () => { throw new Error("LAB_PAIR_MATERIALIZER_INVALID"); };
const exact = (v, keys) => { if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join() !== [...keys].sort().join()) fail(); };
const hash = v => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
function load(d, limit, json = true) {
  exact(d, ["path", "sha256"]); if (!hash(d.sha256)) fail();
  const parts = [];
  try {
    const result = read(d.path, limit, { bytes: 0, maximum: limit }, p => parts.push(Buffer.from(p)));
    const bytes = Buffer.concat(parts);
    try { if (result.sha256 !== d.sha256) fail(); return json ? parse(bytes) : Buffer.from(bytes); }
    finally { bytes.fill(0); }
  } finally { parts.forEach(p => p.fill(0)); }
}
/** Pure overlay application; insert objects are reused, never cloned or changed. */
export function applyYuzhouQuarantineOverlays(phases, overlays) {
  try {
    if (!Array.isArray(phases) || phases.length !== 4 || !Array.isArray(overlays)) fail();
    const byId = new Map();
    for (const o of overlays) {
      exact(o, ["phaseName", "sourceIdentitySha256", "sourceRowSha256", "payloadSha256", "quarantine"]);
      exact(o.quarantine, ["algorithm", "keyReferenceSha256", "payloadCiphertextSha256"]);
      if (![o.sourceIdentitySha256, o.sourceRowSha256, o.payloadSha256, o.quarantine.keyReferenceSha256, o.quarantine.payloadCiphertextSha256].every(hash) || o.quarantine.algorithm !== "aes-256-gcm-external-kek-v1" || byId.has(o.sourceIdentitySha256)) fail();
      byId.set(o.sourceIdentitySha256, o);
    }
    const seen = new Set(); let count = 0;
    const result = phases.map((p, i) => {
      if (p.phase !== `T${i}` || !Array.isArray(p.records)) fail();
      return { ...p, records: p.records.map(r => {
        if (!hash(r.sourceIdentitySha256) || seen.has(r.sourceIdentitySha256) || !["insert", "quarantine"].includes(r.disposition)) fail();
        seen.add(r.sourceIdentitySha256); const o = byId.get(r.sourceIdentitySha256);
        if (r.disposition === "insert") { if (o) fail(); return r; }
        if (!o || o.phaseName !== p.phase || o.sourceRowSha256 !== r.sourceRowSha256 || o.payloadSha256 !== r.payloadSha256) fail();
        count++; return { ...r, quarantine: { ...r.quarantine, ...o.quarantine } };
      }) };
    });
    if (count !== overlays.length) fail(); return result;
  } catch { fail(); }
}

/** Side receipts are non-ready. The separate pair receipt is published only after both sides read back. */
export async function materializeYuzhouRetainedQuarantinePair(input) {
  const keys = new Map();
  try {
    exact(input, ["existingConfig", "sides", "receiptDirectory"]); exact(input.sides, ["A", "B"]);
    const request = structuredClone(input);
    const dirs = [request.receiptDirectory];
    for (const side of ["A", "B"]) { const s = request.sides[side]; exact(s, ["operationId", "keyReferenceSha256", "keyFile", "outputDirectory"]); dirs.push(s.outputDirectory); }
    if (new Set(dirs).size !== 3 || dirs.some(a => dirs.some(b => a !== b && a.startsWith(`${b}/`)))) fail();
    const stats = dirs.map(d => { const stat = directory(d); if (readdirSync(d).length) fail(); return stat; });
    const config = load(request.existingConfig, 65536);
    const prepared = await prepareYuzhouRealBundleLabArtifacts(config.artifacts);
    const phases = [];
    for (const phase of ["T0", "T1", "T2", "T3"]) {
      const bytes = await prepared.readArtifact(`${phase}:records`), payloadBytes = await prepared.readArtifact(`${phase}:payload`);
      try {
        const records = parse(bytes).records, bundle = parse(payloadBytes), payloads = new Map(bundle.records.map(r => [r.sourceIdentitySha256, r]));
        for (const r of records) {
          const p = payloads.get(r.sourceIdentitySha256);
          if (!p || computeProductionImportPayloadHash(p.payload) !== r.payloadSha256) fail();
        }
        phases.push({ phase, records: records.filter(r => r.disposition === "quarantine") });
      } finally { bytes.fill(0); payloadBytes.fill(0); }
    }
    const envelopes = load(config.envelopes, LIMIT), refs = new Set(phases.flatMap(p => p.records.map(r => r.quarantine?.keyReferenceSha256)));
    if (!Array.isArray(config.keyFiles) || config.keyFiles.length !== refs.size) fail();
    const descriptors = [...config.keyFiles, ...Object.values(request.sides).map(s => ({ keyReferenceSha256: s.keyReferenceSha256, keyFile: s.keyFile }))];
    for (const d of descriptors) {
      exact(d, ["keyReferenceSha256", "keyFile"]);
      if (!hash(d.keyReferenceSha256) || keys.has(d.keyReferenceSha256)) fail();
      const key = load(d.keyFile, 32, false); keys.set(d.keyReferenceSha256, key); if (key.length !== 32) fail();
    }
    if ([...refs].some(r => !keys.has(r))) fail();
    const result = await rekeyYuzhouRetainedQuarantine({ preparedTriple: config.artifacts.expectedTriple, operationId: config.artifacts.operationId, targetScope: config.artifacts.targetScope,
      phases, envelopes, sides: Object.fromEntries(Object.entries(request.sides).map(([s, v]) => [s, { operationId: v.operationId, keyReferenceSha256: v.keyReferenceSha256 }])) },
    { resolveKey: async ({ keyReferenceSha256 }) => keys.get(keyReferenceSha256) });
    const sides = {};
    for (const [side, value] of Object.entries(result.sides)) {
      applyYuzhouQuarantineOverlays(phases, value.overlays);
      const artifacts = { "envelopes.json": value.envelopes, "overlays.json": { overlays: value.overlays } };
      const descriptors = Object.fromEntries(Object.entries(artifacts).map(([n, v]) => [n, measure(v, LIMIT)]));
      const target = request.sides[side].outputDirectory; directory(target, stats[side === "A" ? 1 : 2]);
      emit(target, artifacts, { status: "SIDE_ARTIFACTS_ONLY", artifacts: descriptors, formalABVerified: false, productionImport: "HOLD" }, descriptors, LIMIT, "side-receipt.json");
      for (const [name, value] of Object.entries(artifacts)) {
        const back = load({ path: join(target, name), sha256: descriptors[name].sha256 }, LIMIT);
        if (measure(back, LIMIT).sha256 !== measure(value, LIMIT).sha256) fail();
      }
      sides[side] = { operationId: request.sides[side].operationId, keyReferenceSha256: request.sides[side].keyReferenceSha256, artifacts: descriptors };
    }
    const receipt = { status: "PAIR_QUARANTINE_MATERIALS_READY", originalConfigSha256: request.existingConfig.sha256, originalManifestSha256: prepared.manifestSha256,
      preparedTriple: result.preparedTriple, sides, quarantineCount: result.summary.quarantineCount,
      businessArtifactsCopied: false, pairExecuted: false, formalABVerified: false, authorizationClaimed: false, productionImport: "HOLD" };
    // Recheck both sides immediately before publication, not only each side in isolation.
    for (const [side, value] of Object.entries(sides)) for (const [name, descriptor] of Object.entries(value.artifacts)) load({ path: join(request.sides[side].outputDirectory, name), sha256: descriptor.sha256 }, LIMIT);
    // Shared emitter read-verifies and fsyncs the receipt, removing only its own marker on failure.
    directory(request.receiptDirectory, stats[0]); emit(request.receiptDirectory, {}, receipt, {}, LIMIT, "pair-receipt.json");
    return receipt;
  } catch { fail(); }
  finally { for (const k of keys.values()) k.fill(0); }
}
