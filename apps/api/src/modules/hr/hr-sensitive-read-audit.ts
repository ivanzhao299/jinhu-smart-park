import type { TenantParkScope } from "@jinhu/shared";
import type { AuditService,RecordOperationInput } from "../audit/audit.service";

export type HrSensitiveReadFieldGroup = "identity" | "contact" | "demographic" | "education" | "qualification" | "financial" | "compensation" | "attachment" | "employment_contract" | "attendance" | "insurance" | "payroll_input" | "reward_reason" | "work_content" | "feedback";

export interface HrSensitiveReadActor {
  sub: string;
  username: string;
  realName?: string;
  roles: string[];
}

export interface HrSensitiveReadAuditDetails {
  resource: string;
  action: string;
  bizType: string;
  bizId: string | null;
  path: string;
  fieldGroups: readonly HrSensitiveReadFieldGroup[];
  projection: "masked" | "self_masked" | "full" | "self" | "team" | "park" | "admin" | "metadata" | "download";
  itemCount?: number;
  requestId?: string | null;
}

export function buildHrSensitiveReadAuditInput(
  scope: TenantParkScope,
  actor: HrSensitiveReadActor,
  details: HrSensitiveReadAuditDetails
): RecordOperationInput {
  const fieldGroups=details.resource.startsWith("hr.work_report")
    ? [...new Set([...details.fieldGroups,"work_content" as const])]
    : [...details.fieldGroups];
  return {
    tenantId:scope.tenantId,parkId:scope.parkId,userId:actor.sub,username:actor.username,
    realName:actor.realName??null,roleCodes:actor.roles,module:"人力资源管理",resource:details.resource,
    action:details.action,bizType:details.bizType,bizId:details.bizId,beforeJson:null,
    afterJson:{fieldGroups,projection:details.projection,...(details.itemCount===undefined?{}:{itemCount:details.itemCount})},
    method:"GET",path:details.path,success:true,result:"success",requestId:details.requestId??null
  };
}

export async function recordHrSensitiveRead(
  auditService: Pick<AuditService,"recordOperationRequired">,
  scope: TenantParkScope,
  actor: HrSensitiveReadActor,
  details: HrSensitiveReadAuditDetails
): Promise<void> {
  await auditService.recordOperationRequired(buildHrSensitiveReadAuditInput(scope,actor,details));
}
