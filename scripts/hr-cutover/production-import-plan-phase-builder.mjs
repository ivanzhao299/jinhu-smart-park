import { computeProductionImportTouchedPhaseBefore, computeProductionImportTouchedPhaseState } from "./production-import-phase-state.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as MODEL, computeProductionImportTargetCanonicalHash } from "./production-import-target-model.mjs";
import { computeProductionImportPayloadHash, computeProductionImportPayloadBundleHash } from "./production-import-sealed-plan-lib.mjs";
const fail = () => { const e = new Error("PRODUCTION_IMPORT_PLAN_PHASE_INVALID"); e.code = e.message; throw e; };
/** Pure draft phase producer. Baseline must be independently obtained and scope
 * bound; this function neither observes DB state nor supplies authorization. */
export function buildProductionImportPlanPhase({ phase, payloadBundle, targetScope, baseline, dependencyTargets = [] }) {
  if (!MODEL.phaseOrder.includes(phase?.phase) || payloadBundle?.phase !== phase.phase || !Array.isArray(phase.records) || !Array.isArray(payloadBundle.records) ||
      !baseline || !Array.isArray(baseline.rows) || !["tenantId", "parkId", "scopeSha256"].every(k => targetScope?.[k] && baseline.targetScope?.[k] === targetScope[k] && payloadBundle.targetScope?.[k] === targetScope[k]) ||
      !/^[0-9a-f]{64}$/u.test(phase.sourceBatchManifestSha256 ?? "") || payloadBundle.sourceBatchManifestSha256 !== phase.sourceBatchManifestSha256 || payloadBundle.canonicalizationVersion !== MODEL.canonicalizationVersion) fail();
  const base = new Map(), payloads = new Map(), targets = new Map();
  for (const row of baseline.rows) { const key = `${row.targetTable}:${row.targetId}`; if (base.has(key)) fail(); base.set(key, row); }
  for (const row of payloadBundle.records) { if (payloads.has(row.sourceIdentitySha256)) fail(); payloads.set(row.sourceIdentitySha256, row); }
  for (const row of [...dependencyTargets, ...phase.records]) {
    const name = row.phase ?? MODEL.targetTables[row.plannedTargetTable]?.phase, key = `${name}:${row.sourceIdentitySha256}`;
    if (targets.has(key)) fail(); targets.set(key, row);
  }
  const before = [], after = [], absent = [], seen = new Set();
  for (const r of phase.records) {
    const rule = MODEL.targetTables[r.plannedTargetTable], p = payloads.get(r.sourceIdentitySha256);
    if (!rule || rule.phase !== phase.phase || !p || p.targetTable !== r.plannedTargetTable || p.sourceRowSha256 !== r.sourceRowSha256 || p.payloadSha256 !== r.payloadSha256 || computeProductionImportPayloadHash(p.payload) !== r.payloadSha256) fail();
    payloads.delete(r.sourceIdentitySha256);
    if (r.disposition === "quarantine") continue;
    if (!["insert", "merge", "skip_approved"].includes(r.disposition) || r.targetTable !== r.plannedTargetTable) fail();
    if (!Array.isArray(r.dependencyRefs) || (r.disposition === "skip_approved" && r.expectedTargetAfterSha256 !== r.expectedTargetBeforeSha256)) fail();
    const key = `${r.targetTable}:${r.targetId}`; if (seen.has(key)) fail(); seen.add(key);
    const old = base.get(key);
    if (r.disposition === "insert") { if (old || r.targetVersionAfter !== 1) fail(); absent.push({ targetTable: r.targetTable, targetId: r.targetId }); }
    else {
      if (!old || old.version !== r.expectedTargetVersionBefore || computeProductionImportTargetCanonicalHash(r.targetTable, targetScope, old.payload, old.derivedFields) !== r.expectedTargetBeforeSha256 || r.targetVersionAfter !== old.version + (r.disposition === "merge" ? 1 : 0)) fail();
      before.push(old); base.delete(key);
    }
    const derivedFields = {};
    const refs = new Map();
    for (const ref of r.dependencyRefs) { if (refs.has(ref.role) || !rule.foreignKeys.some(fk => fk.dependencyRole === ref.role && fk.targetTable === ref.expectedTargetTable)) fail(); refs.set(ref.role, ref); }
    for (const fk of rule.foreignKeys) {
      const ref = refs.get(fk.dependencyRole);
      if (!ref) { if (fk.required) fail(); derivedFields[fk.column] = null; continue; }
      const parent = targets.get(`${ref.phase}:${ref.sourceIdentitySha256}`);
      if (!parent || parent.disposition === "quarantine" || parent.targetTable !== fk.targetTable || MODEL.targetTables[fk.targetTable]?.phase !== ref.phase || MODEL.phaseOrder.indexOf(ref.phase) > MODEL.phaseOrder.indexOf(phase.phase)) fail();
      derivedFields[fk.column] = parent.targetId;
    }
    if (computeProductionImportTargetCanonicalHash(r.targetTable, targetScope, p.payload, derivedFields) !== r.expectedTargetAfterSha256) fail();
    after.push({ targetTable: r.targetTable, targetId: r.targetId, version: r.targetVersionAfter, payload: p.payload, derivedFields });
  }
  if (base.size || payloads.size) fail();
  return { phase: phase.phase, ordinal: MODEL.phaseOrder.indexOf(phase.phase), sourceBatchManifestSha256: phase.sourceBatchManifestSha256,
    payloadBundleArtifactSha256: computeProductionImportPayloadHash(payloadBundle), payloadBundleSha256: computeProductionImportPayloadBundleHash(payloadBundle), canonicalizationVersion: MODEL.canonicalizationVersion,
    beforeCanonicalSha256: computeProductionImportTouchedPhaseBefore({ phase: phase.phase, targetScope, rows: before, absent }),
    expectedAfterCanonicalSha256: computeProductionImportTouchedPhaseState({ phase: phase.phase, targetScope, rows: after }), records: phase.records };
}
