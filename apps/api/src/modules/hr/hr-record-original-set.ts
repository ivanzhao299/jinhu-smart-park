import { BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { EntityManager } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";

type Snapshot = Record<string, unknown>;
export type OriginalRecordSetCertificate = { count: number; sha256: string };
export type OriginalRecordKind = "skill" | "credential";
const tables = { skill: "hr_employee_skill", credential: "hr_employee_credential" } as const;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const invalid: () => never = () => { throw new BadRequestException("RECORD_ORIGINAL_SET_INVALID"); };
const object = (value: unknown): value is Snapshot => value !== null && typeof value === "object" && !Array.isArray(value);
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);

/** Internal proof primitive; no endpoint or admission authority.
 * IDs/certificate must be resolved from authenticated original T5 receipts and
 * owned_state. A caller-supplied certificate or today's target is not proof of
 * an original operation/source/employee binding. Reuses the family proof's
 * PostgreSQL normalization convention without changing applied migrations. */
export async function recoverCertifiedOriginalRecordSet(
  manager: EntityManager, scope: TenantParkScope, kind: OriginalRecordKind,
  targetIds: string[], certificate: OriginalRecordSetCertificate,
  sensitive: PartySensitiveDataService,
): Promise<Map<string, Snapshot>> {
  if (!manager.queryRunner?.isTransactionActive || !Object.hasOwn(tables, kind)
    || !object(certificate) || !Number.isSafeInteger(certificate.count) || certificate.count < 0
    || certificate.count !== targetIds.length || new Set(targetIds).size !== targetIds.length
    || !digest(certificate.sha256) || targetIds.some(id => !uuid(id))) invalid();
  const table = tables[kind];
  await manager.query("SET LOCAL TIME ZONE 'Asia/Shanghai'");
  // Target before journal, matching ordinary maintenance. Locks are scoped to
  // this transaction: no cached certificate may authorize a later request.
  await manager.query(`LOCK TABLE ${table},${table}_change IN SHARE MODE`);
  const rows = await manager.query(`SELECT to_jsonb(r) AS current,
      j.version AS journal_version,j.before_encrypted FROM ${table} r
    LEFT JOIN LATERAL (SELECT version,before_encrypted FROM ${table}_change
      WHERE record_id=r.id AND tenant_id=r.tenant_id AND park_id=r.park_id
        AND employee_id=r.employee_id AND version>1 ORDER BY version LIMIT 1) j ON true
    WHERE r.id=ANY($1::uuid[]) AND r.tenant_id=$2 AND r.park_id=$3`,
    [targetIds, scope.tenantId, scope.parkId]) as Array<{current: Snapshot; journal_version: number | null; before_encrypted: string | null}>;
  if (rows.length !== certificate.count) invalid();
  const snapshots: Snapshot[] = [];
  for (const row of rows) {
    const current = row.current;
    if (!object(current) || !Number.isSafeInteger(current.version) || Number(current.version) < 1) invalid();
    let original = current;
    if (row.journal_version !== null) {
      if (row.journal_version !== 2 || Number(current.version) < 2 || typeof row.before_encrypted !== "string") invalid();
      try {
        const text = sensitive.decrypt(row.before_encrypted);
        if (!text || text.length > 1024 * 1024) invalid();
        const decoded: unknown = JSON.parse(text);
        if (!object(decoded)) invalid();
        original = decoded;
      } catch { invalid(); }
    } else if (current.version !== 1 || row.before_encrypted !== null) invalid();
    if (Object.keys(original).sort().join("\0") !== Object.keys(current).sort().join("\0")
      || original.version !== 1 || original.is_deleted !== false
      || !digest(original.legacy_source_identity_sha256) || !digest(original.legacy_source_row_sha256)) invalid();
    for (const key of ["id", "tenant_id", "park_id", "employee_id", "legacy_source_identity_sha256", "legacy_source_row_sha256"])
      if (original[key] !== current[key]) invalid();
    snapshots.push(original);
  }
  // Recover original SQL types and timestamptz precision before hashing; a
  // JavaScript JSON digest is not interchangeable with the original SQL hash.
  let normalized: Array<{original: Snapshot; canonical: string}>;
  try {
    normalized = await manager.query(`SELECT to_jsonb(value) AS original,to_jsonb(value)::text AS canonical
      FROM jsonb_populate_recordset(NULL::${table},$1::jsonb) AS value`, [JSON.stringify(snapshots)]);
  } catch { return invalid(); }
  if (normalized.length !== certificate.count) invalid();
  const originals = new Map<string, Snapshot>(), hashes: string[] = [];
  for (const row of normalized) {
    if (!uuid(row.original.id) || originals.has(row.original.id)) invalid();
    originals.set(row.original.id, row.original);
    hashes.push(sha(row.canonical));
  }
  if (sha(hashes.sort().join("")) !== certificate.sha256) invalid();
  return originals;
}
