import { ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { canonicalYuzhouInitialJson, type TenantParkScope, type YuzhouInsurancePolicyBaselineWitness } from "@jinhu/shared";
import { isUUID } from "class-validator";
import type { EntityManager } from "typeorm";
import { originalReceipt } from "./hr-yuzhou-initial-baseline";
import { insurancePolicyFlatFacts, normalizeInsurancePolicyFacts } from "./hr-yuzhou-insurance-policy-transaction";

export type InsurancePolicyOriginalWitness = YuzhouInsurancePolicyBaselineWitness;
const kinds = ["oldage", "remedy", "losework", "fund", "wound", "bear"] as const;
const slots = [["", "base"], ["_e", "employer"], ["_p", "employee"], ["_pc", "supplement"]] as const;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const invalid = (): never => { throw new ConflictException("INSURANCE_POLICY_ORIGINAL_EVIDENCE_INVALID"); };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const canonical = (value: unknown) => { try { return canonicalYuzhouInitialJson(value); } catch { return invalid(); } };
function exact(value: unknown, keys: readonly string[]) {
  if (!object(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) return invalid();
}
function scaled(value: unknown, scale: number): bigint | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 32 || !/^[+-]?\d+(?:\.\d+)?$/u.test(value)) return invalid();
  const [whole, fraction = ""] = value.replace(/^[+-]/u, "").split(".");
  if (fraction.length > scale || (whole!.replace(/^0+/u, "") || "0").length > 18 - scale) return invalid();
  return BigInt(`${value.startsWith("-") ? "-" : ""}${whole}${fraction.padEnd(scale, "0")}`);
}
const policyKeys = ["tenant_id", "park_id", "policy_code", "policy_name", "scope_description", "status", "is_historical_import", "remark"];
const amountColumns = slots.flatMap(([, component]) => [`${component}_rate`, `${component}_fixed_amount`]);
const itemKeys = ["tenant_id", "park_id", "policy_id", "insurance_kind", "variant_no", ...amountColumns, "source_snapshot", "remark"];

/** Existing normalized six-item original layout only. Old twelve-item layouts
 * need their separate authenticated recovery chain, never current-value baselines. */
export async function verifyInsurancePolicyOriginalBaseline(manager: EntityManager, scope: TenantParkScope, sourceKey: string, witness: InsurancePolicyOriginalWitness) {
  if (!manager.queryRunner?.isTransactionActive || !/^sha256:[a-f0-9]{64}$/u.test(sourceKey) || !object(witness)) return invalid();
  exact(witness, ["operationId", "source", "policy", "items"]);
  if (typeof witness.operationId !== "string" || !witness.operationId || !object(witness.source) || !Array.isArray(witness.items) || witness.items.length !== 6) return invalid();
  const raw = witness.source;
  exact(raw, ["id", "des", "rightscope", ...kinds.flatMap(kind => slots.flatMap(([suffix]) => [`${kind}${suffix}`, `${kind}${suffix}2`]))]);
  if (!Number.isInteger(raw.id) || Number(raw.id) < -2147483648 || Number(raw.id) > 2147483647 || hash(`dbo.insure_method\0${raw.id}`) !== sourceKey.slice(7)) return invalid();
  exact(witness.policy, ["targetId", "projection"]); exact(witness.policy.projection, policyKeys);
  const parent = witness.policy.projection;
  if (!isUUID(witness.policy.targetId) || parent.tenant_id !== scope.tenantId || parent.park_id !== scope.parkId || parent.policy_code !== `YUZHOU-${raw.id}` || parent.policy_name !== raw.des || parent.scope_description !== raw.rightscope || parent.status !== "historical" || parent.is_historical_import !== true) return invalid();
  const receipt = await originalReceipt(manager, scope, witness.operationId, "T3", sourceKey.slice(7));
  if (receipt.source_table !== "dbo.insure_method" || receipt.target_table !== "hr_insurance_policy" || receipt.target_id !== witness.policy.targetId || receipt.source_row_sha256 !== hash(canonical(raw)) || receipt.target_after_sha256 !== hash(`yuzhou-hr-production-target-canonical-sha256-v1\0hr_insurance_policy\0${canonical(parent)}`)) return invalid();
  const items: Array<Record<string, unknown>> = [], identities = new Set<string>(), targets = new Set<string>();
  for (const item of witness.items) {
    exact(item, ["targetId", "projection"]); exact(item.projection, itemKeys);
    const projection = item.projection, kind = projection.insurance_kind;
    if (typeof kind !== "string" || !kinds.includes(kind as typeof kinds[number]) || identities.has(kind) || targets.has(item.targetId) || !isUUID(item.targetId) || projection.variant_no !== 1 || projection.tenant_id !== scope.tenantId || projection.park_id !== scope.parkId || projection.policy_id !== witness.policy.targetId) return invalid();
    identities.add(kind); targets.add(item.targetId);
    const discriminator = `${kind}\0${1}`;
    const identity = hash(`yuzhou-hr-production-source-projection-v1\0${sourceKey.slice(7)}\0hr_insurance_policy_item\0${discriminator}`);
    const child = await originalReceipt(manager, scope, witness.operationId, "T3", identity);
    if (child.source_table !== "dbo.insure_method" || child.target_table !== "hr_insurance_policy_item" || child.target_id !== item.targetId || child.source_row_sha256 !== hash(canonical({ parentSourceRowSha256: receipt.source_row_sha256, discriminator })) || child.target_after_sha256 !== hash(`yuzhou-hr-production-target-canonical-sha256-v1\0hr_insurance_policy_item\0${canonical(projection)}`)) return invalid();
    const dependencies = await manager.query("SELECT dependency_role,depends_on_phase,depends_on_source_identity_sha256,expected_target_table FROM hr_yuzhou_production_import_record_dependency WHERE operation_id=$1 AND phase='T3' AND source_identity_sha256=$2 FOR SHARE", [witness.operationId, identity]);
    if (dependencies.length !== 1 || dependencies[0].dependency_role !== "policy" || dependencies[0].depends_on_phase !== "T3" || dependencies[0].depends_on_source_identity_sha256 !== sourceKey.slice(7) || dependencies[0].expected_target_table !== "hr_insurance_policy") return invalid();
    exact(projection.source_snapshot, ["sourceRowSha256"]);
    if ((projection.source_snapshot as Record<string, unknown>).sourceRowSha256 !== receipt.source_row_sha256) return invalid();
    const normalized: Record<string, unknown> = { kind, variant: 1 };
    for (const [suffix, component] of slots) {
      const rate = scaled(projection[`${component}_rate`], 6), sourceRate = scaled(raw[`${kind}${suffix}`], 3);
      const fixed = scaled(projection[`${component}_fixed_amount`], 3), sourceFixed = scaled(raw[`${kind}${suffix}2`], 3);
      if (rate !== (sourceRate === null ? null : sourceRate * 10n) || fixed !== sourceFixed) throw new ConflictException("INSURANCE_POLICY_ORIGINAL_LAYOUT_REQUIRES_RECOVERY");
      normalized[`${component}Rate`] = projection[`${component}_rate`]; normalized[`${component}FixedAmount`] = projection[`${component}_fixed_amount`];
    }
    items.push(normalized);
  }
  let facts;
  try { facts = normalizeInsurancePolicyFacts({ name: parent.policy_name, scopeDescription: parent.scope_description, items }); }
  catch { return invalid(); }
  const envelope = { operationId: witness.operationId, source: witness.source, policy: { ...witness.policy }, items: witness.items.map(item => ({ ...item })) };
  return { policyId: witness.policy.targetId, source: insurancePolicyFlatFacts(facts), target: insurancePolicyFlatFacts(facts), originalRowSha256: receipt.source_row_sha256, witnessSha256: hash(canonical(envelope)) };
}
