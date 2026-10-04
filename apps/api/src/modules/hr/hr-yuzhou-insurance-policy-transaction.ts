import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { YUZHOU_INSURANCE_POLICY_IMPORT_MANAGE, YUZHOU_INSURANCE_POLICY_KINDS, type TenantParkScope } from "@jinhu/shared";
import { isUUID } from "class-validator";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { createHash } from "node:crypto";
import { profileCanonical } from "./hr-yuzhou-profile-baseline";
import { HR_INSURANCE_SOURCE_FACTOR_COLUMNS, insuranceSourceFactorsHash, type InsuranceSourceFactor } from "./hr-insurance-policy-source";

const kinds = YUZHOU_INSURANCE_POLICY_KINDS;
const components = ["base", "employer", "employee", "supplement"] as const;
const amountFields = components.flatMap(component => [`${component}Rate`, `${component}FixedAmount`]);
type Scalar = string | null;
export type InsurancePolicyFacts = { name: Scalar; scopeDescription: Scalar; items: Array<Record<string, Scalar | number>> };
const bad = (): never => { throw new BadRequestException("INSURANCE_POLICY_IMPORT_FACTS_INVALID"); };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is Scalar => value === null || (typeof value === "string" && value.length <= max && !value.includes("\0") && !/\p{Surrogate}/u.test(value));
function decimal(value: unknown, scale: number, signed: boolean): Scalar {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[+-]?\d+(?:\.\d+)?$/u.test(value)) return bad();
  const negative = value.startsWith("-"), [rawWhole, rawFraction = ""] = value.replace(/^[+-]/u, "").split(".");
  const whole = rawWhole!.replace(/^0+/u, "") || "0", fraction = rawFraction.replace(/0+$/u, "");
  if (whole.length > 18 - scale || fraction.length > scale || (!signed && negative && (whole !== "0" || fraction))) return bad();
  return `${negative && (whole !== "0" || fraction) ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
export function normalizeInsurancePolicyFacts(value: unknown): InsurancePolicyFacts {
  if (!object(value) || Object.keys(value).length !== 3 || !text(value.name, 200) || !text(value.scopeDescription, 500) || !Array.isArray(value.items) || value.items.length !== 6) return bad();
  const indexed = new Map<string, Record<string, Scalar | number>>();
  for (const item of value.items) {
    if (!object(item) || Object.keys(item).length !== 10 || typeof item.kind !== "string" || !kinds.includes(item.kind as typeof kinds[number]) || item.variant !== 1 || indexed.has(item.kind)) return bad();
    const result: Record<string, Scalar | number> = { kind: item.kind, variant: 1 };
    for (const field of amountFields) {
      if (!Object.hasOwn(item, field)) return bad();
      const fixed = field.endsWith("FixedAmount");
      result[field] = decimal(item[field], fixed ? 3 : 6, fixed);
    }
    indexed.set(item.kind, result);
  }
  return { name: value.name, scopeDescription: value.scopeDescription, items: kinds.map(kind => indexed.get(kind)!) };
}
export function insurancePolicyFlatFacts(value: unknown): Record<string, Scalar> {
  const facts = normalizeInsurancePolicyFacts(value), flat: Record<string, Scalar> = { name: facts.name, scopeDescription: facts.scopeDescription };
  for (const item of facts.items) for (const field of amountFields) flat[`${item.kind}.${field}`] = item[field] as Scalar;
  return flat;
}
export function insurancePolicyFactsFromFlat(value: unknown): InsurancePolicyFacts {
  if (!object(value) || Object.keys(value).length !== 50) return bad();
  const facts = normalizeInsurancePolicyFacts({ name: value.name, scopeDescription: value.scopeDescription,
    items: kinds.map(kind => ({ kind, variant: 1, ...Object.fromEntries(amountFields.map(field => [field, value[`${kind}.${field}`]])) })) });
  if (Object.keys(value).some(field => !Object.hasOwn(insurancePolicyFlatFacts(facts), field))) return bad();
  return facts;
}
export function planInsurancePolicyFacts(incoming: unknown, source: Readonly<Record<string, Scalar>>, current: unknown, baseline: Readonly<Record<string, Scalar>>) {
  const facts = insurancePolicyFlatFacts(incoming), target = insurancePolicyFlatFacts(current);
  const changedFields: string[] = [], conflictFields: string[] = [], updates: Record<string, Scalar> = {};
  for (const [field, value] of Object.entries(facts)) {
    if (!Object.hasOwn(source, field) || !Object.hasOwn(baseline, field)) { conflictFields.push(field); continue; }
    if (value === source[field]) continue;
    changedFields.push(field);
    if (value === target[field]) continue;
    if (target[field] !== baseline[field]) conflictFields.push(field);
    else updates[field] = value;
  }
  return { action: conflictFields.length ? "conflict" as const : changedFields.length ? "update" as const : "unchanged" as const, changedFields, conflictFields, updates: conflictFields.length ? {} : updates };
}

/** Internal primitive. The package executor must authenticate source, serialize
 * identity, persist ledger/baselines and mandatory audit in this same transaction. */
export function requireInsurancePolicyImportTransaction(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal) {
  if (!manager.queryRunner?.isTransactionActive) throw new ConflictException("INSURANCE_POLICY_IMPORT_TRANSACTION_REQUIRED");
  const required = YUZHOU_INSURANCE_POLICY_IMPORT_MANAGE;
  if (actor.tenantId !== scope.tenantId || actor.parkId !== scope.parkId || !isUUID(actor.sub) || (!actor.isSuper && !actor.permissions.includes("*") && required.some(permission => !actor.permissions.includes(permission)))) throw new ForbiddenException();
}
export async function createInsurancePolicyInTransaction(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, sourceKey: string, value: unknown) {
  requireInsurancePolicyImportTransaction(manager, scope, actor);
  if (!/^sha256:[a-f0-9]{64}$/u.test(sourceKey)) throw new BadRequestException("INSURANCE_POLICY_IMPORT_IDENTITY_INVALID");
  const facts = normalizeInsurancePolicyFacts(value);
  const rows = typeormQueryRows<{ id: string; version: number }>(await manager.query(`INSERT INTO hr_insurance_policy(tenant_id,park_id,policy_code,policy_name,scope_description,status,is_historical_import,create_by,update_by)
    VALUES($1,$2,$3,$4,$5,'historical',true,$6,$6) RETURNING id,version`, [scope.tenantId, scope.parkId, `YZ-IP-${sourceKey.slice(7, 65)}`, facts.name, facts.scopeDescription, actor.sub]));
  if (rows.length !== 1 || !isUUID(rows[0]!.id) || rows[0]!.version !== 1) throw new ConflictException("INSURANCE_POLICY_IMPORT_WRITE_FAILED");
  const policyId = rows[0]!.id;
  for (const item of facts.items) {
    const inserted = typeormQueryRows<{ id: string }>(await manager.query(`INSERT INTO hr_insurance_policy_item(tenant_id,park_id,policy_id,insurance_kind,variant_no,base_rate,employer_rate,employee_rate,supplement_rate,base_fixed_amount,employer_fixed_amount,employee_fixed_amount,supplement_fixed_amount,source_snapshot,create_by,update_by)
      VALUES($1,$2,$3,$4,1,$5::numeric,$6::numeric,$7::numeric,$8::numeric,$9::numeric,$10::numeric,$11::numeric,$12::numeric,$13::jsonb,$14,$14) RETURNING id`, [scope.tenantId, scope.parkId, policyId, item.kind, ...components.map(component => item[`${component}Rate`]), ...components.map(component => item[`${component}FixedAmount`]), JSON.stringify(item), actor.sub]));
    if (inserted.length !== 1 || !isUUID(inserted[0]!.id)) throw new ConflictException("INSURANCE_POLICY_IMPORT_WRITE_FAILED");
  }
  return { policyId, version: 1, activated: false, facts };
}

const factsHash = (facts: InsurancePolicyFacts) => createHash("sha256").update(profileCanonical(facts)).digest("hex");
const columnNames = Object.fromEntries(components.flatMap(component => [[`${component}Rate`, `${component}_rate`], [`${component}FixedAmount`, `${component}_fixed_amount`]]));
export async function readInsurancePolicyForImport(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, policyId: string, lock = false) {
  requireInsurancePolicyImportTransaction(manager, scope, actor);
  if (!isUUID(policyId)) throw new BadRequestException("INSURANCE_POLICY_IMPORT_IDENTITY_INVALID");
  const parents = await manager.query(`SELECT policy_name,scope_description,version,status FROM hr_insurance_policy WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND NOT is_deleted ${lock ? "FOR UPDATE" : ""}`, [policyId, scope.tenantId, scope.parkId]);
  if (parents.length !== 1 || parents[0].status !== "historical" || !Number.isSafeInteger(parents[0].version) || parents[0].version < 1) throw new ConflictException("INSURANCE_POLICY_IMPORT_TARGET_INVALID");
  const rows: Array<InsuranceSourceFactor & { variant_no: number }> = await manager.query(`SELECT ${HR_INSURANCE_SOURCE_FACTOR_COLUMNS},variant_no FROM hr_insurance_policy_item WHERE policy_id=$1 AND tenant_id=$2 AND park_id=$3 AND NOT is_deleted ORDER BY insurance_kind,id ${lock ? "FOR UPDATE" : ""}`, [policyId, scope.tenantId, scope.parkId]);
  if (rows.some(row => row.variant_no !== 1)) throw new ConflictException("INSURANCE_POLICY_IMPORT_TARGET_INVALID");
  const factors = rows.map(({ variant_no: _variant, ...factor }) => factor);
  const items = factors.map(factor => ({ kind: factor.insurance_kind, variant: 1, ...Object.fromEntries(amountFields.map(field => [field, factor[columnNames[field] as keyof InsuranceSourceFactor]])) }));
  const facts = normalizeInsurancePolicyFacts({ name: parents[0].policy_name, scopeDescription: parents[0].scope_description, items });
  return { policyId, version: Number(parents[0].version), factorHash: insuranceSourceFactorsHash(factors), factsHash: factsHash(facts), facts, factors };
}

/** CAS includes child versions and metadata facts, even if an external editor
 * failed to bump the parent version. Only explicitly selected fields are written. */
export async function updateInsurancePolicyInTransaction(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, policyId: string, expected: { version: number; factorHash: string; factsHash: string }, updates: Readonly<Record<string, Scalar>>) {
  requireInsurancePolicyImportTransaction(manager, scope, actor);
  if (!object(expected) || !Number.isSafeInteger(expected.version) || expected.version < 1 || expected.version >= 2147483647 || !/^[a-f0-9]{64}$/u.test(expected.factorHash) || !/^[a-f0-9]{64}$/u.test(expected.factsHash) || !object(updates)) return bad();
  const current = await readInsurancePolicyForImport(manager, scope, actor, policyId, true);
  if (current.version !== expected.version || current.factorHash !== expected.factorHash || current.factsHash !== expected.factsHash) throw new ConflictException("INSURANCE_POLICY_IMPORT_CONCURRENT_CHANGE");
  const flat = insurancePolicyFlatFacts(current.facts);
  for (const field of Object.keys(updates)) if (!Object.hasOwn(flat, field)) return bad();
  const next: InsurancePolicyFacts = { name: Object.hasOwn(updates, "name") ? updates.name! : current.facts.name, scopeDescription: Object.hasOwn(updates, "scopeDescription") ? updates.scopeDescription! : current.facts.scopeDescription, items: current.facts.items.map(item => ({ ...item, ...Object.fromEntries(amountFields.filter(field => Object.hasOwn(updates, `${item.kind}.${field}`)).map(field => [field, updates[`${item.kind}.${field}`]!])) })) };
  const validated = normalizeInsurancePolicyFacts(next), selected = insurancePolicyFlatFacts(validated);
  const changed = Object.keys(updates).filter(field => selected[field] !== flat[field]);
  if (!changed.length) return { policyId, version: current.version, activated: false, facts: current.facts };
  for (const factor of current.factors) {
    const fields = amountFields.filter(field => changed.includes(`${factor.insurance_kind}.${field}`));
    if (!fields.length) continue;
    const values = [factor.id, scope.tenantId, scope.parkId, policyId, factor.version, actor.sub, ...fields.map(field => selected[`${factor.insurance_kind}.${field}`])];
    const rows = typeormQueryRows<{ id: string }>(await manager.query(`UPDATE hr_insurance_policy_item SET ${fields.map((field, index) => `${columnNames[field]}=$${index + 7}::numeric`).join(",")},version=version+1,update_by=$6,update_time=now() WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND policy_id=$4 AND version=$5 AND NOT is_deleted RETURNING id`, values));
    if (rows.length !== 1) throw new ConflictException("INSURANCE_POLICY_IMPORT_CONCURRENT_CHANGE");
  }
  const parent = typeormQueryRows<{ version: number }>(await manager.query("UPDATE hr_insurance_policy SET policy_name=$5,scope_description=$6,version=version+1,update_by=$7,update_time=now() WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND version=$4 AND NOT is_deleted RETURNING version", [policyId, scope.tenantId, scope.parkId, current.version, validated.name, validated.scopeDescription, actor.sub]));
  if (parent.length !== 1) throw new ConflictException("INSURANCE_POLICY_IMPORT_CONCURRENT_CHANGE");
  return { policyId, version: parent[0]!.version, activated: false, facts: validated };
}
