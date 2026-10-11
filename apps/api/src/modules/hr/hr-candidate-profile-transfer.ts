import { ConflictException, ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import type { AuditService } from "../audit/audit.service";

type TransferReceipt = { candidateVersion: number; fields: string[]; profileId?: string; beforeVersion?: number; afterVersion?: number };
type Row = Record<string, string | number | boolean | null>;
function conflict(code: string): never { throw new ConflictException(code); }
const normalize = (value: string, kind: string) => kind === "email"
  ? value.trim().toLowerCase() : value.replace(/\s+/g, "").toUpperCase();

// Caller holds candidate and employee row locks, in that order, within conversion's transaction.
export async function transferCandidateProfile(
  manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal,
  candidateId: string, employeeId: string, sensitive: PartySensitiveDataService, audit: AuditService
): Promise<TransferReceipt> {
  const [source] = await manager.query(`SELECT version,mobile_encrypted,mobile_masked,mobile_fingerprint,
    email_encrypted,email_masked,email_fingerprint,identity_encrypted,identity_masked,identity_fingerprint
    FROM hr_candidate WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE`,
  [candidateId, scope.tenantId, scope.parkId]) as Row[];
  if (!source) conflict("HR_CANDIDATE_PROFILE_SOURCE_CONFLICT");
  const values: Record<string, string> = {};
  for (const kind of ["mobile", "email", "identity"]) {
    const triple = ["encrypted", "masked", "fingerprint"].map(key => source[`${kind}_${key}`]);
    if (triple.every(value => value === null)) continue;
    if (triple.some(value => typeof value !== "string" || !value)) conflict("HR_CANDIDATE_PROFILE_SOURCE_CONFLICT");
    const plain = sensitive.decrypt(String(triple[0]));
    if (!plain || plain !== normalize(plain, kind) || sensitive.hash(plain) !== triple[2]
      || sensitive.mask(plain) !== triple[1]) conflict("HR_CANDIDATE_PROFILE_SOURCE_CONFLICT");
    values[kind] = plain;
  }
  if (!Object.keys(values).length) return { candidateVersion: Number(source.version), fields: [] };
  if (!actor.isSuper && !actor.permissions.includes("*")
    && !actor.permissions.includes(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE)) {
    throw new ForbiddenException("衔接候选人资料需要员工档案管理权限，请由有权限的 HR 办理");
  }
  if ((values.mobile?.length ?? 0) > 32 || (values.email?.length ?? 0) > 128) {
    conflict("HR_CANDIDATE_PROFILE_LENGTH_CONFLICT");
  }
  const profiles = await manager.query(`SELECT id,version,is_deleted,personal_mobile,personal_email,
    id_number_encrypted,id_number_masked,id_number_fingerprint FROM hr_employee_profile
    WHERE employee_id=$1 AND tenant_id=$2 AND park_id=$3 FOR UPDATE`,
  [employeeId, scope.tenantId, scope.parkId]) as Row[];
  if (profiles.length > 1 || profiles.some(profile => profile.is_deleted)) conflict("HR_CANDIDATE_PROFILE_TARGET_CONFLICT");
  const profile = profiles[0];
  const changes: Record<string, string> = {};
  for (const kind of ["mobile", "email"]) {
    if (!values[kind]) continue;
    const column = `personal_${kind}`, current = profile?.[column];
    if (current !== null && current !== undefined) {
      if (normalize(String(current), kind) !== values[kind]) conflict("HR_CANDIDATE_PROFILE_TARGET_CONFLICT");
    } else changes[column] = values[kind];
  }
  if (values.identity) {
    const columns = ["id_number_encrypted", "id_number_masked", "id_number_fingerprint"];
    const current = columns.map(column => profile?.[column] ?? null);
    if (current.some(value => value !== null)) {
      if (current.some(value => typeof value !== "string" || !value)
        || sensitive.decrypt(String(current[0])) !== values.identity
        || current[1] !== sensitive.mask(values.identity)
        || current[2] !== source.identity_fingerprint) conflict("HR_CANDIDATE_PROFILE_TARGET_CONFLICT");
    } else columns.forEach((column, index) => {
      changes[column] = String(source[["identity_encrypted", "identity_masked", "identity_fingerprint"][index]!]);
    });
  }
  const fields = Object.keys(changes);
  const beforeVersion = Number(profile?.version ?? 0);
  let profileId = profile ? String(profile.id) : undefined;
  if (fields.length) {
    const parameters = [scope.tenantId, scope.parkId, employeeId, actor.sub, ...Object.values(changes)];
    try {
      if (profile) {
        await manager.query(`UPDATE hr_employee_profile SET ${fields.map((field, index) => `${field}=$${index + 5}`).join(",")},
          version=version+1,update_by=$4,update_time=now() WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND is_deleted=false`, parameters);
      } else {
        const rows = await manager.query(`INSERT INTO hr_employee_profile(tenant_id,park_id,employee_id,create_by,update_by,${fields.join(",")})
          VALUES($1,$2,$3,$4,$4,${fields.map((_, index) => `$${index + 5}`).join(",")}) RETURNING id`, parameters) as Row[];
        profileId = rows[0]?.id ? String(rows[0].id) : undefined;
        if (!profileId) conflict("HR_CANDIDATE_PROFILE_TARGET_CONFLICT");
      }
    } catch (error) {
      if ((error as { code?: string }).code === "23505") conflict("HR_CANDIDATE_PROFILE_IDENTITY_CONFLICT");
      throw error;
    }
  }
  const receipt = { candidateVersion: Number(source.version), profileId,
    beforeVersion, afterVersion: beforeVersion + (fields.length ? 1 : 0), fields };
  await audit.recordOperationRequired({ tenantId: scope.tenantId, parkId: scope.parkId, userId: actor.sub,
    module: "人力资源管理", resource: "hr.employee_profile", action: "候选人资料衔接员工档案", bizType: "hr_employee",
    bizId: employeeId, beforeJson: { version: beforeVersion }, afterJson: receipt,
    method: "POST", path: "/hr/recruitment/candidates/:id/convert", success: true, requestId: null }, manager);
  return receipt;
}
