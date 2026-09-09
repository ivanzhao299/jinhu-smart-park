import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { prepareYuzhouRealBundleLabArtifacts } from "./yuzhou-real-bundle-lab-artifacts.mjs";
import { applyYuzhouQuarantineOverlays } from "./materialize-yuzhou-retained-quarantine-pair.mjs";
import { validateYuzhouLabResourceDescriptor } from "./yuzhou-lab-resource-descriptor.mjs";
import { readProductionImportPrivateBytes as read, parseProductionImportPrivateJson as parse,
  measureProductionImportPrivateJson as measure } from "./materialize-production-import-frozen-decisions.mjs";
const LIMIT = 256 * 1024 * 1024;
const sha = v => createHash("sha256").update(v).digest("hex");
const fail = () => { throw new Error("LAB_SIDE_MATERIALS_INVALID"); };
const exact = (v, keys) => { if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join() !== [...keys].sort().join()) fail(); };
const same = (a, b) => measure(a, LIMIT).sha256 === measure(b, LIMIT).sha256;
function load(d, limit = LIMIT) {
  exact(d, ["path", "sha256"]); if (!/^[a-f0-9]{64}$/u.test(d.sha256 ?? "")) fail();
  const parts = [];
  try {
    const result = read(d.path, limit, { bytes: 0, maximum: limit }, p => parts.push(Buffer.from(p)));
    if (result.sha256 !== d.sha256) fail();
    const bytes = Buffer.concat(parts); try { return parse(bytes); } finally { bytes.fill(0); }
  } finally { parts.forEach(p => p.fill(0)); }
}
export function validateYuzhouPairSideConfig(c) {
  try {
    const p = c.pairMaterials;
    exact(p, ["side", "originalConfig", "receipt", "sideReceipt", "overlays"]);
    if (!["A", "B"].includes(p.side)) fail();
    for (const d of [p.originalConfig, p.receipt, p.sideReceipt, p.overlays]) { exact(d, ["path", "sha256"]); if (!/^[a-f0-9]{64}$/u.test(d.sha256 ?? "")) fail(); }
    const r = validateYuzhouLabResourceDescriptor(c.resourceDescriptor);
    if (r.database !== c.artifacts.target.database || ["container", "containerId", "imageId", "port"].some(k => r[k] !== c[k])) fail();
    return c;
  } catch { fail(); }
}
/** Pinned original payload files remain external; phase crypto overlays are projected in memory. */
export async function prepareYuzhouRetainedQuarantineSide(c) {
  try {
    validateYuzhouPairSideConfig(c);
    const p = c.pairMaterials, original = load(p.originalConfig, 65536), receipt = load(p.receipt, 65536);
    exact(receipt, ["status", "originalConfigSha256", "originalManifestSha256", "preparedTriple", "sides", "quarantineCount", "businessArtifactsCopied", "pairExecuted", "formalABVerified", "authorizationClaimed", "productionImport"]);
    if (receipt.status !== "PAIR_QUARANTINE_MATERIALS_READY" || receipt.originalConfigSha256 !== p.originalConfig.sha256 || receipt.productionImport !== "HOLD" || ["businessArtifactsCopied", "pairExecuted", "formalABVerified", "authorizationClaimed"].some(k => receipt[k] !== false)) fail();
    exact(receipt.sides, ["A", "B"]);
    for (const k of ["preparedRoot", "expectedSummarySha256", "expectedTriple", "targetScope", "expectedCounts", "httpCounts"]) if (!same(original.artifacts[k], c.artifacts[k])) fail();
    if (original.stateRoot !== c.stateRoot || !same(receipt.preparedTriple, c.artifacts.expectedTriple) ||
        ["codeSha", "sourceSnapshotHash", "mappingSha256"].some(k => original.artifacts.binding[k] !== c.artifacts.binding[k])) fail();
    const side = receipt.sides[p.side], other = receipt.sides[p.side === "A" ? "B" : "A"];
    for (const s of [side, other]) exact(s, ["operationId", "keyReferenceSha256", "artifacts"]);
    if (side.operationId !== c.artifacts.operationId || new Set([side.operationId, other.operationId, original.artifacts.operationId]).size !== 3 || side.keyReferenceSha256 === other.keyReferenceSha256 ||
        !Array.isArray(c.keyFiles) || c.keyFiles.length !== 1 || c.keyFiles[0].keyReferenceSha256 !== side.keyReferenceSha256 || original.keyFiles.some(k => k.keyReferenceSha256 === side.keyReferenceSha256)) fail();
    exact(side.artifacts, ["envelopes.json", "overlays.json"]);
    if (c.envelopes.sha256 !== side.artifacts["envelopes.json"].sha256 || p.overlays.sha256 !== side.artifacts["overlays.json"].sha256) fail();
    const expectedSideReceipt = { status: "SIDE_ARTIFACTS_ONLY", artifacts: side.artifacts, formalABVerified: false, productionImport: "HOLD" };
    if (p.sideReceipt.sha256 !== measure(expectedSideReceipt, LIMIT).sha256 || !same(load(p.sideReceipt, 65536), expectedSideReceipt)) fail();
    const envelopes = load(c.envelopes), overlayDocument = load(p.overlays); exact(overlayDocument, ["overlays"]);
    if (envelopes.operationId !== side.operationId || envelopes.entries.some(e => e.kind !== "quarantine" || e.envelope.keyReferenceSha256 !== side.keyReferenceSha256) ||
        !Number.isSafeInteger(receipt.quarantineCount) || overlayDocument.overlays.length !== receipt.quarantineCount || envelopes.entries.length !== receipt.quarantineCount) fail();
    const source = await prepareYuzhouRealBundleLabArtifacts(original.artifacts);
    if (source.manifestSha256 !== receipt.originalManifestSha256) fail();
    const originalManifest = parse(source.manifestBytes), phases = [];
    for (const d of originalManifest.phases) { const b = await source.readArtifact(d.phaseArtifact.ref); try { phases.push(parse(b)); } finally { b.fill(0); } }
    const projected = applyYuzhouQuarantineOverlays(phases, overlayDocument.overlays), pins = new Map();
    const descriptors = originalManifest.phases.map((d, i) => {
      const bytes = Buffer.from(JSON.stringify(projected[i])); pins.set(d.phaseArtifact.ref, { bytes, originalSha256: d.phaseArtifact.sha256 });
      return { ...d, phaseArtifact: { ...d.phaseArtifact, sha256: sha(bytes) } };
    });
    const { binding, target, targetScope, runId, operationId, expectedCounts, httpCounts } = c.artifacts;
    const manifestBytes = Buffer.from(JSON.stringify({ binding, target, targetScope, runId, operationId, expectedCounts, httpCounts, phases: descriptors }));
    return { status: "ARTIFACTS_VERIFIED", productionImport: "HOLD", manifestBytes, manifestSha256: sha(manifestBytes),
      sourceProvenance: { preparedTriple: receipt.preparedTriple, originalConfigSha256: p.originalConfig.sha256, pairMaterialsReceiptSha256: p.receipt.sha256, side: p.side, currentCommitVerified: false },
      readArtifact: async ref => {
        try {
          const bytes = await source.readArtifact(ref), pin = pins.get(ref);
          if (!pin) return bytes;
          try { if (sha(bytes) !== pin.originalSha256) fail(); return Buffer.from(pin.bytes); } finally { bytes.fill(0); }
        } catch { fail(); }
      } };
  } catch { fail(); }
}
