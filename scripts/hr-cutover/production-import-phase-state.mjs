import { createHash } from "node:crypto";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as MODEL, stableProductionImportCanonicalJson } from "./production-import-target-model.mjs";
import { normalizeProductionImportTargetFields } from "./production-import-payload-generator.mjs";

export const PRODUCTION_TOUCHED_PHASE_STATE_VERSION = "yuzhou-production-touched-phase-state-v1";
const fail = () => { const error = new Error("PRODUCTION_IMPORT_PHASE_STATE_INVALID"); error.code = error.message; throw error; };
/** Input is independently projected expected fields OR verified database fields;
 * never expected row hashes. Quarantine has no business row and is excluded by caller. */
export function computeProductionImportTouchedPhaseState({ phase, targetScope, rows }) {
  if (!MODEL.phaseOrder.includes(phase) || !targetScope?.tenantId || !targetScope?.parkId || !Array.isArray(rows)) fail();
  const ids = new Set();
  const projected = rows.map(row => {
    const rule = MODEL.targetTables[row.targetTable];
    if (!rule || rule.phase !== phase || !/^[0-9a-f-]{36}$/u.test(row.targetId ?? "") || !Number.isSafeInteger(row.version) || row.version < 1) fail();
    const key = `${row.targetTable}:${row.targetId}`; if (ids.has(key)) fail(); ids.add(key);
    const payload = normalizeProductionImportTargetFields(row.targetTable, row.payload, rule);
    if (!row.derivedFields || Object.keys(row.derivedFields).sort().join() !== [...rule.derivedFields].sort().join()) fail();
    for (const value of Object.values(row.derivedFields)) if (value !== null && !/^[0-9a-f-]{36}$/u.test(value ?? "")) fail();
    return { targetTable: row.targetTable, targetId: row.targetId, version: row.version, payload, derivedFields: row.derivedFields };
  }).sort((a,b) => a.targetTable < b.targetTable ? -1 : a.targetTable > b.targetTable ? 1 : a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0);
  return createHash("sha256").update(PRODUCTION_TOUCHED_PHASE_STATE_VERSION).update("\0")
    .update(stableProductionImportCanonicalJson({ phase, targetScope: { tenantId: targetScope.tenantId, parkId: targetScope.parkId }, rows: projected })).digest("hex");
}
