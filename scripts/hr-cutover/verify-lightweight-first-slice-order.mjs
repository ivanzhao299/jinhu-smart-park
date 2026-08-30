#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DEFAULT_CONTRACT = resolve(ROOT, "scripts/hr-cutover/contracts/lightweight-first-slice-order-v1.json");
const ORDER = ["T0", "T1", "T2", "T5_NONFILE", "T3", "T4"];

export class LightweightFirstSliceOrderError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function exact(actual, expected, code) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new LightweightFirstSliceOrderError(code);
}

export function verifyLightweightFirstSliceOrder(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) throw new LightweightFirstSliceOrderError("LIGHTWEIGHT_FIRST_CONTRACT_INVALID");
  exact(Object.keys(contract).sort(), ["contractKind", "executionStatus", "formatVersion", "orderedSlices", "productionImport", "rollbackOrder", "separateHolds", "sourceBinding"], "LIGHTWEIGHT_FIRST_CONTRACT_SHAPE_INVALID");
  if (contract.formatVersion !== 1 || contract.contractKind !== "yuzhou_hr_lightweight_first_slice_order" || contract.executionStatus !== "SPEC_FROZEN" || contract.productionImport !== "HOLD") throw new LightweightFirstSliceOrderError("LIGHTWEIGHT_FIRST_CONTRACT_METADATA_INVALID");
  exact(contract.sourceBinding, { sourceSystem: "yuzhou_hr_v10", requiresControlledBackup: true, requiresReadOnlySource: true }, "LIGHTWEIGHT_FIRST_SOURCE_BOUNDARY_INVALID");
  if (!Array.isArray(contract.orderedSlices) || contract.orderedSlices.length !== ORDER.length) throw new LightweightFirstSliceOrderError("LIGHTWEIGHT_FIRST_SLICE_COUNT_INVALID");
  exact(contract.orderedSlices.map((slice) => slice.id), ORDER, "LIGHTWEIGHT_FIRST_SLICE_ORDER_INVALID");
  for (const [index, slice] of contract.orderedSlices.entries()) {
    if (!slice || typeof slice !== "object" || Array.isArray(slice)) throw new LightweightFirstSliceOrderError("LIGHTWEIGHT_FIRST_SLICE_INVALID");
    exact(slice.dependsOn, ORDER.slice(0, index), "LIGHTWEIGHT_FIRST_DEPENDENCY_INVALID");
    exact(slice.mustFinishBefore, ORDER.slice(index + 1), "LIGHTWEIGHT_FIRST_PRECEDENCE_INVALID");
  }
  const t5 = contract.orderedSlices[3];
  if (t5.scope !== "employee_profile_family_skill_credential_without_files" || t5.fileEvidence !== "prohibited") throw new LightweightFirstSliceOrderError("LIGHTWEIGHT_FIRST_NONFILE_BOUNDARY_INVALID");
  const t4 = contract.orderedSlices.at(-1);
  if (t4.scope !== "payroll_history_and_reconciliation" || t4.mustBeLastDataWriteSlice !== true || t4.productionImport !== "HOLD") throw new LightweightFirstSliceOrderError("LIGHTWEIGHT_FIRST_PAYROLL_NOT_LAST");
  exact(contract.rollbackOrder, [...ORDER].reverse(), "LIGHTWEIGHT_FIRST_ROLLBACK_ORDER_INVALID");
  exact(contract.separateHolds, {
    T5_FILE: { scope: "photos_and_attachments", status: "HOLD", requiresSeparateAuthorization: true, notPartOfOrderedDataWrites: true },
    productionHistoricalImport: { status: "HOLD", requiresOneTimeAuthorization: true }
  }, "LIGHTWEIGHT_FIRST_HOLD_BOUNDARY_INVALID");
  return { ok: true, order: ORDER, productionImport: "HOLD" };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = resolve(process.argv[2] ?? DEFAULT_CONTRACT);
  const result = verifyLightweightFirstSliceOrder(JSON.parse(readFileSync(path, "utf8")));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
