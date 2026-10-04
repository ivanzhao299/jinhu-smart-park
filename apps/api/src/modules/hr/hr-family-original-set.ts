import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";

type Snapshot = Record<string, unknown>;
export type OriginalFamilySetCertificate = { count: number; sha256: string };
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const invalid = (): never => { throw new BadRequestException("FAMILY_ORIGINAL_SET_INVALID"); };
const object = (value: unknown): value is Snapshot => value !== null && typeof value === "object" && !Array.isArray(value);

/** Internal primitive only. IDs and certificate must come from authenticated,
 * immutable original receipts/owned_state, never from a client or current data.
 * This is not the operation/source/employee-owner proof or an import endpoint. */
export async function recoverCertifiedOriginalFamilySet(
  manager: EntityManager, scope: TenantParkScope, targetIds: string[],
  certificate: OriginalFamilySetCertificate, sensitive: PartySensitiveDataService,
): Promise<Map<string, Snapshot>> {
  if (!manager.queryRunner?.isTransactionActive || !Number.isSafeInteger(certificate.count)
    || certificate.count < 0 || certificate.count !== targetIds.length
    || new Set(targetIds).size !== targetIds.length || !/^[a-f0-9]{64}$/.test(certificate.sha256)
    || targetIds.some(id => !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))) invalid();
  await manager.query("SET LOCAL TIME ZONE 'Asia/Shanghai'");
  // Same order as ordinary family writes: target first, then immutable journal.
  await manager.query("LOCK TABLE hr_employee_family,hr_employee_family_change IN SHARE MODE");
  const rows = await manager.query(`SELECT to_jsonb(f) AS current, j.version AS journal_version,
      j.before_encrypted FROM hr_employee_family f
    LEFT JOIN LATERAL (SELECT version,before_encrypted FROM hr_employee_family_change
      WHERE family_id=f.id AND tenant_id=f.tenant_id AND park_id=f.park_id
        AND employee_id=f.employee_id AND version>1 ORDER BY version LIMIT 1) j ON true
    WHERE f.id=ANY($1::uuid[]) AND f.tenant_id=$2 AND f.park_id=$3`,
    [targetIds, scope.tenantId, scope.parkId]) as Array<{ current: Snapshot; journal_version: number | null; before_encrypted: string | null }>;
  if (rows.length !== certificate.count) invalid();
  const originals = new Map<string, Snapshot>();
  const hashes: string[] = [];
  const snapshots: Snapshot[] = [];
  for (const row of rows) {
    const current = row.current;
    let original = current;
    if (row.before_encrypted !== null) {
      if (row.journal_version !== 2) invalid();
      try {
        const decoded: unknown = JSON.parse(sensitive.decrypt(row.before_encrypted)!);
        if (object(decoded)) original = decoded;
        else invalid();
      } catch { invalid(); }
    } else if (current.version !== 1) invalid();
    if (Object.keys(original).sort().join("\0") !== Object.keys(current).sort().join("\0")
      || original.version !== 1 || original.is_deleted !== false
      || typeof original.legacy_source_identity_sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(original.legacy_source_identity_sha256)
      || typeof original.legacy_source_row_sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(original.legacy_source_row_sha256)) invalid();
    for (const key of ["id", "tenant_id", "park_id", "employee_id", "legacy_source_identity_sha256", "legacy_source_row_sha256"])
      if (original[key] !== current[key]) invalid();
    snapshots.push(original);
  }
  // One round trip for the complete set. Reparse actual PostgreSQL types and
  // serialize using the original SQL convention, including timezone precision.
  let normalized: Array<{ original: Snapshot; canonical: string }> = [];
  try {
    normalized = await manager.query(`SELECT to_jsonb(value) AS original,to_jsonb(value)::text AS canonical
      FROM jsonb_populate_recordset(NULL::hr_employee_family,$1::jsonb) AS value`, [JSON.stringify(snapshots)]);
  } catch { invalid(); }
  if (normalized.length !== certificate.count) invalid();
  for (const value of normalized) {
    originals.set(String(value.original.id), value.original);
    hashes.push(sha(value.canonical));
  }
  if (sha(hashes.sort().join("")) !== certificate.sha256) invalid();
  return originals;
}
