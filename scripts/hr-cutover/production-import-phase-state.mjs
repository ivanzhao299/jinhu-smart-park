import { createHash } from "node:crypto";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as MODEL, stableProductionImportCanonicalJson } from "./production-import-target-model.mjs";
import { normalizeProductionImportTargetFields } from "./production-import-payload-generator.mjs";

export const PRODUCTION_TOUCHED_PHASE_STATE_VERSION = "yuzhou-production-touched-phase-state-v1";
export const PRODUCTION_TOUCHED_PHASE_BEFORE_VERSION = "yuzhou-production-touched-phase-before-v1";
const fail = () => { const error = new Error("PRODUCTION_IMPORT_PHASE_STATE_INVALID"); error.code = error.message; throw error; };
function normalizeTouchedPayload(table, payload, rule) {
  if (table !== "hr_contract_legacy_evidence" || payload?.size_bytes === null || payload?.size_bytes === undefined) return normalizeProductionImportTargetFields(table, payload, rule);
  // This one existing SQL storage override is bigint (writer TABLE_STORAGE),
  // unlike the model's ordinary safe-integer fields. Do not round through Number.
  const value = payload.size_bytes;
  if (typeof value !== "string" && !(typeof value === "number" && Number.isSafeInteger(value))) fail();
  const text = String(value);
  if (!/^(?:0|-?[1-9][0-9]*)$/u.test(text) || text.length > 20) fail();
  const integer = BigInt(text);
  if (integer < -9223372036854775808n || integer > 9223372036854775807n) fail();
  return normalizeProductionImportTargetFields(table, { ...payload, size_bytes: text }, { ...rule, integerFields: rule.integerFields.filter(field => field !== "size_bytes") });
}
/** Input is independently projected expected fields OR verified database fields;
 * never expected row hashes. Quarantine has no business row and is excluded by caller. */
export function computeProductionImportTouchedPhaseState({ phase, targetScope, rows }) {
  if (!MODEL.phaseOrder.includes(phase) || !targetScope?.tenantId || !targetScope?.parkId || !Array.isArray(rows)) fail();
  const ids = new Set();
  const projected = rows.map(row => {
    const rule = MODEL.targetTables[row.targetTable];
    if (!rule || rule.phase !== phase || !/^[0-9a-f-]{36}$/u.test(row.targetId ?? "") || !Number.isSafeInteger(row.version) || row.version < 1) fail();
    const key = `${row.targetTable}:${row.targetId}`; if (ids.has(key)) fail(); ids.add(key);
    const payload = normalizeTouchedPayload(row.targetTable, row.payload, rule);
    if (!row.derivedFields || Object.keys(row.derivedFields).sort().join() !== [...rule.derivedFields].sort().join()) fail();
    for (const value of Object.values(row.derivedFields)) if (value !== null && !/^[0-9a-f-]{36}$/u.test(value ?? "")) fail();
    return { targetTable: row.targetTable, targetId: row.targetId, version: row.version, payload, derivedFields: row.derivedFields };
  }).sort((a,b) => a.targetTable < b.targetTable ? -1 : a.targetTable > b.targetTable ? 1 : a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0);
  return createHash("sha256").update(PRODUCTION_TOUCHED_PHASE_STATE_VERSION).update("\0")
    .update(stableProductionImportCanonicalJson({ phase, targetScope: { tenantId: targetScope.tenantId, parkId: targetScope.parkId }, rows: projected })).digest("hex");
}

export function computeProductionImportTouchedPhaseBefore({ phase, targetScope, rows, absent }) {
  const presentStateSha256 = computeProductionImportTouchedPhaseState({ phase, targetScope, rows });
  if (!Array.isArray(absent)) fail();
  const seen = new Set(rows.map(r => `${r.targetTable}:${r.targetId}`));
  const missing = absent.map(r => {
    if (MODEL.targetTables[r.targetTable]?.phase !== phase || !/^[0-9a-f-]{36}$/u.test(r.targetId ?? "")) fail();
    const key = `${r.targetTable}:${r.targetId}`; if (seen.has(key)) fail(); seen.add(key);
    return { targetTable: r.targetTable, targetId: r.targetId };
  }).sort((a,b) => `${a.targetTable}:${a.targetId}` < `${b.targetTable}:${b.targetId}` ? -1 : 1);
  return createHash("sha256").update(PRODUCTION_TOUCHED_PHASE_BEFORE_VERSION).update("\0")
    .update(stableProductionImportCanonicalJson({ phase, targetScope: { tenantId: targetScope.tenantId, parkId: targetScope.parkId }, presentStateSha256, absent: missing })).digest("hex");
}
