import { BadRequestException, ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { isUUID } from "class-validator";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import type { AuditService } from "../audit/audit.service";
import { profileCanonical } from "./hr-yuzhou-profile-baseline";
import { verifyInsurancePolicyOriginalBaseline, type InsurancePolicyOriginalWitness } from "./hr-yuzhou-insurance-policy-baseline";
import { createInsurancePolicyInTransaction, insurancePolicyFactsFromFlat, insurancePolicyFlatFacts, normalizeInsurancePolicyFacts, planInsurancePolicyFacts, readInsurancePolicyForImport, requireInsurancePolicyImportTransaction, updateInsurancePolicyInTransaction } from "./hr-yuzhou-insurance-policy-transaction";

export type InsurancePolicyImportItem = { domain: "insurance_policy"; sourceTable: string; sourceKey: string; rowDigest: string; fields: Record<string, unknown>; sourceUpdatedAt?: string; insurancePolicyBaselineWitness?: InsurancePolicyOriginalWitness };
type Flat = Record<string, string | null>;
type Ledger = { id: string; target_id: string; target_table: string; source_facts_encrypted: string; source_facts_sha256: string; baseline_encrypted: string; version: number; target_version: number };
const hash = (value: unknown) => createHash("sha256").update(profileCanonical(value)).digest("hex");
const invalid = (): never => { throw new ConflictException("INSURANCE_POLICY_IMPORT_EVIDENCE_INVALID"); };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
function decode(sensitive: PartySensitiveDataService, cipher: string) {
  try { const raw = sensitive.decrypt(cipher); if (!raw || raw.length > 1048576) return invalid(); const value: unknown = JSON.parse(raw); return object(value) ? value : invalid(); }
  catch { return invalid(); }
}
function flat(value: unknown): Flat {
  try { const result = insurancePolicyFlatFacts(insurancePolicyFactsFromFlat(value)); if (profileCanonical(result) !== profileCanonical(value)) return invalid(); return result; }
  catch { return invalid(); }
}

/** Internal adapter. The public package layer owns operation/package validation,
 * terminal replay and batch permissions; this adapter also checks them locally.
 * No original receipt, modern immutable version or financial period is rewritten. */
export async function executeYuzhouInsurancePolicyItem(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal,
  item: InsurancePolicyImportItem, sensitive: PartySensitiveDataService, audit: AuditService, operationId?: string) {
  requireInsurancePolicyImportTransaction(manager, scope, actor);
  if (item.domain !== "insurance_policy" || item.sourceTable !== "dbo.insure_method" || !/^sha256:[a-f0-9]{64}$/u.test(item.sourceKey)) throw new BadRequestException("INSURANCE_POLICY_IMPORT_SOURCE_INVALID");
  const incoming = normalizeInsurancePolicyFacts(item.fields);
  if (hash({ domain: item.domain, sourceTable: item.sourceTable, sourceKey: item.sourceKey, sourceUpdatedAt: item.sourceUpdatedAt ?? null, fields: item.fields }) !== item.rowDigest) throw new BadRequestException("INSURANCE_POLICY_IMPORT_DIGEST_INVALID");
  const params = [scope.tenantId, scope.parkId, item.sourceKey];
  if (operationId) {
    if (!isUUID(operationId)) return invalid();
    const operations = await manager.query("SELECT status FROM hr_incremental_import_operation WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND source_system='yuzhou-v10' FOR UPDATE", [operationId, scope.tenantId, scope.parkId]);
    if (operations.length !== 1 || !["previewed", "committing"].includes(operations[0].status)) return invalid();
    await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [profileCanonical([...params, "yuzhou-v10", "insurance_policy"])]);
  }
  let prior = (await manager.query(`SELECT * FROM hr_incremental_import_item WHERE tenant_id=$1 AND park_id=$2 AND source_system='yuzhou-v10' AND domain='insurance_policy' AND source_table='dbo.insure_method' AND source_key=$3 ${operationId ? "FOR UPDATE" : ""}`, params))[0] as Ledger | undefined;
  if (prior && operationId) {
    const replay = await manager.query("SELECT outcome,source_row_sha256 FROM hr_incremental_import_revision WHERE operation_id=$1 AND item_id=$2", [operationId, prior.id]);
    if (replay.length) { if (replay.length !== 1 || replay[0].source_row_sha256 !== item.rowDigest) return invalid(); return replay[0].outcome as "applied" | "unchanged" | "conflict"; }
  }
  const maps = await manager.query("SELECT target_table,target_id,mapping_status FROM legacy_record_map WHERE source_system='yuzhou-v10' AND source_table='dbo.insure_method' AND source_identity_sha256=$1 AND is_active FOR SHARE", [item.sourceKey.slice(7)]);
  if (maps.length > 1 || (maps.length === 1 && maps[0].target_table !== "hr_insurance_policy")) return invalid();
  if (maps.some((row: { mapping_status: string }) => !["loaded", "verified"].includes(row.mapping_status))) throw new ConflictException("INSURANCE_POLICY_ORIGINAL_MAPPING_UNRESOLVED");
  let source: Flat | undefined, baseline: Flat | undefined, original: InsurancePolicyOriginalWitness | null = null;
  let originalProof: Awaited<ReturnType<typeof verifyInsurancePolicyOriginalBaseline>> | undefined;
  let targetId: string | undefined;
  if (prior) {
    if (prior.target_table !== "hr_insurance_policy" || !Number.isSafeInteger(prior.version) || prior.version < 1 || prior.version >= 2147483647) return invalid();
    source = flat(decode(sensitive, prior.source_facts_encrypted)); if (hash(source) !== prior.source_facts_sha256) return invalid();
    const saved = decode(sensitive, prior.baseline_encrypted);
    if (Object.keys(saved).sort().join(",") !== "original,target") return invalid();
    baseline = flat(saved.target); original = saved.original as InsurancePolicyOriginalWitness | null;
    const bindings = await manager.query("SELECT * FROM hr_incremental_insurance_policy_binding WHERE item_id=$1 FOR SHARE", [prior.id]);
    if (bindings.length !== 1) return invalid(); const binding = bindings[0];
    if (binding.tenant_id !== scope.tenantId || binding.park_id !== scope.parkId || binding.policy_id !== prior.target_id || binding.source_identity_sha256 !== item.sourceKey.slice(7)) return invalid();
    if (original !== null) {
      originalProof = await verifyInsurancePolicyOriginalBaseline(manager, scope, item.sourceKey, original);
      if (originalProof.policyId !== prior.target_id || binding.original_operation_id !== original.operationId || binding.witness_sha256 !== originalProof.witnessSha256 || binding.original_row_sha256 !== originalProof.originalRowSha256 || maps.length !== 1 || maps[0].target_id !== prior.target_id) return invalid();
    } else if (binding.original_operation_id !== null || maps.length) return invalid();
    if (item.insurancePolicyBaselineWitness && (!original || hash(item.insurancePolicyBaselineWitness) !== hash(original))) return invalid();
    targetId = prior.target_id;
  } else if (maps.length) {
    targetId = maps[0].target_id;
    // Resolve the scoped formal target even when no original witness is supplied.
    await readInsurancePolicyForImport(manager, scope, actor, targetId!);
    if (!item.insurancePolicyBaselineWitness) {
      const fields = ["INITIAL_FIELD_BASELINE_UNKNOWN"];
      if (!operationId) return preview(item, "conflict", fields);
      await recordAudit(manager, scope, actor, audit, operationId, "conflict", fields, item.rowDigest);
      return "conflict" as const;
    }
    original = item.insurancePolicyBaselineWitness;
    originalProof = await verifyInsurancePolicyOriginalBaseline(manager, scope, item.sourceKey, original);
    if (originalProof.policyId !== targetId) return invalid();
    source = originalProof.source; baseline = originalProof.target;
  } else if (item.insurancePolicyBaselineWitness) return invalid();

  let current = targetId ? await readInsurancePolicyForImport(manager, scope, actor, targetId, Boolean(operationId)) : undefined;
  const plan = current ? planInsurancePolicyFacts(incoming, source!, current.facts, baseline!) : undefined;
  if (!operationId) return preview(item, plan?.action ?? "create", plan?.conflictFields ?? []);
  const wasNew = !targetId;
  if (!targetId) {
    const created = await createInsurancePolicyInTransaction(manager, scope, actor, item.sourceKey, incoming);
    targetId = created.policyId; source = insurancePolicyFlatFacts(incoming); baseline = { ...source };
    current = await readInsurancePolicyForImport(manager, scope, actor, targetId, true);
  }
  if (!prior) {
    // Original adoption stores authenticated original facts, even when the
    // incoming change conflicts. It never accepts that conflicting source row.
    const initialDigest = wasNew ? item.rowDigest : hash({ domain: item.domain, sourceTable: item.sourceTable, sourceKey: item.sourceKey, sourceUpdatedAt: null, fields: insurancePolicyFactsFromFlat(source!) });
    prior = (await manager.query(`INSERT INTO hr_incremental_import_item(tenant_id,park_id,source_system,source_table,source_key,domain,target_table,target_id,last_row_sha256,source_facts_encrypted,source_facts_sha256,baseline_encrypted,last_operation_id,target_version)
 VALUES($1,$2,'yuzhou-v10','dbo.insure_method',$3,'insurance_policy','hr_insurance_policy',$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [...params, targetId, initialDigest, sensitive.encrypt(profileCanonical(source)), hash(source), sensitive.encrypt(profileCanonical({ target: baseline, original })), operationId, current!.version]))[0];
    if (!prior) return invalid();
    await manager.query(`INSERT INTO hr_incremental_insurance_policy_binding(item_id,tenant_id,park_id,policy_id,original_operation_id,original_phase,source_identity_sha256,original_row_sha256,witness_sha256,created_by)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [prior.id, scope.tenantId, scope.parkId, targetId, original?.operationId ?? null, original ? "T3" : null, item.sourceKey.slice(7), originalProof?.originalRowSha256 ?? null, originalProof?.witnessSha256 ?? null, actor.sub]);
  }
  let outcome: "applied" | "unchanged" | "conflict";
  const fields = plan?.action === "conflict" ? plan.conflictFields : plan?.changedFields ?? Object.keys(source!);
  if (plan?.action === "conflict") outcome = "conflict";
  else {
    if (current && plan && Object.keys(plan.updates).length) {
      await updateInsurancePolicyInTransaction(manager, scope, actor, targetId!, current, plan.updates);
      current = await readInsurancePolicyForImport(manager, scope, actor, targetId!, true);
    }
    const next = { ...baseline }, actual = insurancePolicyFlatFacts(current!.facts);
    for (const field of plan?.changedFields ?? Object.keys(actual)) next[field] = actual[field]!;
    const accepted = insurancePolicyFlatFacts(incoming);
    await manager.query(`UPDATE hr_incremental_import_item SET last_row_sha256=$2,source_facts_encrypted=$3,source_facts_sha256=$4,baseline_encrypted=$5,version=version+1,target_version=$6,last_operation_id=$7,update_time=now() WHERE id=$1`, [prior.id, item.rowDigest, sensitive.encrypt(profileCanonical(accepted)), hash(accepted), sensitive.encrypt(profileCanonical({ target: next, original })), current!.version, operationId]);
    outcome = wasNew || plan?.action === "update" ? "applied" : "unchanged";
  }
  await manager.query(`INSERT INTO hr_incremental_import_revision(operation_id,item_id,revision_no,outcome,source_row_sha256,field_diff,before_receipt,after_receipt)
 VALUES($1,$2,(SELECT COALESCE(max(revision_no),0)+1 FROM hr_incremental_import_revision WHERE item_id=$2),$3,$4,$5::jsonb,'{}'::jsonb,$6::jsonb)`, [operationId, prior.id, outcome, item.rowDigest, profileCanonical(fields.map(field => ({ field }))), profileCanonical({ policyVersion: current!.version, activated: false })]);
  await recordAudit(manager, scope, actor, audit, operationId, outcome, fields, item.rowDigest);
  return outcome;
}
function preview(item: InsurancePolicyImportItem, action: "create" | "update" | "unchanged" | "conflict", conflictFields: string[]) {
  return { domain: item.domain, sourceTable: item.sourceTable, sourceKey: item.sourceKey, fields: Object.keys(insurancePolicyFlatFacts(item.fields)), action, conflictFields };
}
function recordAudit(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, audit: AuditService, operationId: string, outcome: string, fields: string[], rowDigest: string) {
  return audit.recordOperationRequired({ tenantId: scope.tenantId, parkId: scope.parkId, userId: actor.sub, username: actor.username, realName: actor.realName ?? null, roleCodes: actor.roles,
    module: "人力资源管理", resource: "hr.insurance_policy_incremental_import", action: "导入社保政策来源事实", bizType: "hr_incremental_import", bizId: operationId,
    beforeJson: null, afterJson: { outcome, fields, rowDigest, activated: false }, method: "POST", path: "/hr/imports/yuzhou/incremental/:id/commit", success: true, result: outcome, requestId: null }, manager);
}
