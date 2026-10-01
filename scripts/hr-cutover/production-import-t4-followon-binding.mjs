import { createHash } from "node:crypto";
import { validateProductionImportSingleOwnerPolicy } from "./production-import-approval-policy.mjs";

export const T4_FILES = Object.freeze(["scheme-memberships.jsonl", "items.jsonl", "formulas.jsonl", "tax-rules.jsonl", "closes.jsonl", "payslips.jsonl"]);
export const T4_TABLES = Object.freeze(["hr_payroll_legacy_batch", "hr_payroll_book", "hr_payroll_item_definition", "hr_payroll_item_version", "hr_payroll_formula_version", "hr_payroll_book_period", "hr_payroll_book_membership", "hr_payroll_tax_rule_version", "hr_payroll_legacy_snapshot", "hr_payroll_legacy_snapshot_item", "hr_payroll_review_case"]);
export const T4_COUNTS = Object.freeze({ sourceRows: 46092, snapshotItems: 1078020, memberships: 647, items: 711, formulas: 244, taxRules: 9, closes: 1431, hotRows: 8342, hotItems: 190880, hotCloses: 266, fullNet: "102194056.8000", hotNet: "15723009.9100" });
export const canonicalT4 = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonicalT4).join(",")}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalT4(value[key])}`).join(",")}}`;
export const hashT4 = value => createHash("sha256").update(value).digest("hex");
export const failT4 = code => { const error = new Error(code); error.code = code; throw error; };
export function exactT4(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) failT4("T4_SHAPE_INVALID");
}
export const shaT4 = value => { if (!/^[a-f0-9]{64}$/u.test(value ?? "")) failT4("T4_HASH_INVALID"); };
export const sameT4 = (a, b) => canonicalT4(a) === canonicalT4(b);

export function validateT4Binding(binding) {
  exactT4(binding, ["formatVersion", "artifactKind", "intent", "operationId", "triple", "executionCodeSha", "parent", "targetIdentitySha256", "targetScopeSha256", "targetScope", "finalRehearsalPairSha256", "manifestSha256", "files", "sourceRestoreReceiptSha256", "sourceBusinessSha256", "counts", "amountTotals", "mode", "windowStartsAt", "windowEndsAt", "runtimeReceiptSha256"]);
  if (binding.formatVersion !== 1 || binding.artifactKind !== "yuzhou_t4_followon_binding" || binding.intent !== "APPEND_UNPUBLISHED_T4_FULL_ARCHIVE_ONCE" || binding.mode !== "full_archive" || !/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/u.test(binding.operationId ?? "")) failT4("T4_INTENT_INVALID");
  exactT4(binding.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
  if (![binding.triple.codeSha, binding.executionCodeSha].every(value => /^[a-f0-9]{40}$/u.test(value ?? ""))) failT4("T4_CODE_INVALID");
  exactT4(binding.parent, ["operationId", "sealedPlanSha256", "receiptSha256", "recordSetSha256", "payloadBundleSha256"]);
  if (!/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/u.test(binding.parent.operationId ?? "") || binding.parent.operationId === binding.operationId) failT4("T4_PARENT_INVALID");
  exactT4(binding.parent.payloadBundleSha256, ["T0", "T1", "T2", "T3"]);
  exactT4(binding.files, T4_FILES);
  [binding.triple.sourceSnapshotHash, binding.triple.mappingContractHash, binding.targetIdentitySha256, binding.targetScopeSha256, binding.finalRehearsalPairSha256, binding.manifestSha256, binding.sourceRestoreReceiptSha256, binding.sourceBusinessSha256, binding.runtimeReceiptSha256, binding.parent.sealedPlanSha256, binding.parent.receiptSha256, binding.parent.recordSetSha256, ...Object.values(binding.parent.payloadBundleSha256), ...Object.values(binding.files)].forEach(shaT4);
  exactT4(binding.targetScope, ["tenantId", "parkId", "scopeSha256"]);
  if (![binding.targetScope.tenantId, binding.targetScope.parkId].every(value => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value ?? "")) || binding.targetScope.scopeSha256 !== binding.targetScopeSha256 || !sameT4(binding.counts, T4_COUNTS)) failT4("T4_SCOPE_OR_COUNTS_INVALID");
  exactT4(binding.amountTotals, ["full", "hot"]);
  for (const totals of Object.values(binding.amountTotals)) {
    exactT4(totals, ["gross_total", "deduction_total", "tax_total", "net_total"]);
    if (!Object.values(totals).every(value => /^-?[0-9]{1,16}\.[0-9]{4}$/u.test(value ?? ""))) failT4("T4_AMOUNT_BINDING_INVALID");
  }
  if (binding.amountTotals.full.net_total !== T4_COUNTS.fullNet || binding.amountTotals.hot.net_total !== T4_COUNTS.hotNet) failT4("T4_AMOUNT_BINDING_INVALID");
  const start = Date.parse(binding.windowStartsAt), end = Date.parse(binding.windowEndsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) failT4("T4_WINDOW_INVALID");
  return binding;
}

export function validateT4Authorization({ binding, authorization, intent = "append", now = new Date() }) {
  if (!["append", "rollback"].includes(intent)) failT4("T4_INTENT_INVALID");
  validateT4Binding(binding);
  exactT4(authorization, ["context", "approvalPolicy", "approvalSet"]);
  const expectedBinding = intent === "append" ? binding : { ...binding, intent: "ROLLBACK_UNPUBLISHED_T4_FULL_ARCHIVE_ONCE" };
  if (!sameT4(authorization.context.binding, expectedBinding) || authorization.context.operationId !== binding.operationId || !sameT4(authorization.context.payloadBundleSha256, binding.parent.payloadBundleSha256)) failT4("T4_AUTHORIZATION_INTENT_MISMATCH");
  validateProductionImportSingleOwnerPolicy({ ...authorization, context: authorization.context });
  const current = new Date(now).getTime();
  if (!Number.isFinite(current) || current < Date.parse(authorization.context.issuedAt) || current >= Date.parse(authorization.context.expiresAt)) failT4("T4_AUTHORIZATION_EXPIRED");
  return hashT4(canonicalT4(authorization));
}
