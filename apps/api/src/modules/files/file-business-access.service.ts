import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import {
  PROPERTY_BUSINESS_PERMISSIONS,
  HR_PERMISSIONS,
  SYSTEM_PERMISSIONS,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import type { FileEntity } from "./entities/file.entity";

export const PROPERTY_BUSINESS_FILE_TYPES = [
  "housing_lease_signature",
  "housing_handover",
  "housing_handover_move_in",
  "housing_handover_move_out",
  "housing_repair",
  "housing_purchase",
  "homestay_turnover",
  "floorplan",
  "party_identity_evidence"
  ,"hr_employee_document","hr_employee_photo","hr_candidate_resume","hr_candidate_offer_evidence","hr_employee_credential_evidence","hr_lifecycle_checklist_evidence","hr_training_certificate","hr_training_evidence","hr_reward_evidence","hr_contract_document"
] as const;

type PropertyBusinessFileType = (typeof PROPERTY_BUSINESS_FILE_TYPES)[number];
type RuleBasedPropertyBusinessFileType = Exclude<
  PropertyBusinessFileType,
  "floorplan" | "party_identity_evidence" | "hr_employee_document" | "hr_employee_photo" | "hr_candidate_resume" | "hr_candidate_offer_evidence" | "hr_employee_credential_evidence" | "hr_lifecycle_checklist_evidence" | "hr_training_certificate" | "hr_training_evidence" | "hr_reward_evidence" | "hr_contract_document"
>;
type AccessAction = "upload" | "read" | "download" | "delete";
type FloorAccessAction = "read" | "write";

const ACCESS_RULES: Record<RuleBasedPropertyBusinessFileType, {
  readPermissions: readonly string[];
  writePermissions: readonly string[];
  referenceTable: string;
}> = {
  housing_lease_signature: {
    readPermissions: [
      SYSTEM_PERMISSIONS.HOUSING_LEASE_READ,
      SYSTEM_PERMISSIONS.HOUSING_LEASE_SIGN
    ],
    writePermissions: [SYSTEM_PERMISSIONS.HOUSING_LEASE_SIGN],
    referenceTable: "biz_housing_lease"
  },
  housing_handover: {
    readPermissions: [
      SYSTEM_PERMISSIONS.HOUSING_LEASE_READ,
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ,
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE
    ],
    writePermissions: [SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE],
    referenceTable: "biz_housing_lease"
  },
  housing_handover_move_in: {
    readPermissions: [
      SYSTEM_PERMISSIONS.HOUSING_LEASE_READ,
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ,
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE
    ],
    writePermissions: [SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE],
    referenceTable: "biz_housing_lease"
  },
  housing_handover_move_out: {
    readPermissions: [
      SYSTEM_PERMISSIONS.HOUSING_LEASE_READ,
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ,
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE
    ],
    writePermissions: [SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE],
    referenceTable: "biz_housing_lease"
  },
  housing_repair: {
    readPermissions: [
      SYSTEM_PERMISSIONS.HOUSING_LEASE_READ,
      SYSTEM_PERMISSIONS.HOUSING_REPAIR_READ,
      SYSTEM_PERMISSIONS.HOUSING_REPAIR_MANAGE
    ],
    writePermissions: [SYSTEM_PERMISSIONS.HOUSING_REPAIR_MANAGE],
    referenceTable: "biz_housing_lease"
  },
  housing_purchase: {
    readPermissions: [
      SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ,
      SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE
    ],
    writePermissions: [SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE],
    referenceTable: "biz_housing_purchase"
  },
  homestay_turnover: {
    readPermissions: [SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_READ],
    writePermissions: [SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE],
    referenceTable: "biz_homestay_turnover_task"
  }
};

@Injectable()
export class FileBusinessAccessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataScopeService: DataScopeService
  ) {}

  isProtectedBizType(value: string): value is PropertyBusinessFileType {
    return (PROPERTY_BUSINESS_FILE_TYPES as readonly string[]).includes(value);
  }

  assertRoutePermission(actor:JwtPrincipal,bizType:string|undefined,action:AccessAction):void{
    if(bizType&&this.isProtectedBizType(bizType))return;
    const permission=action==="upload"?SYSTEM_PERMISSIONS.FILE_UPLOAD:action==="delete"?SYSTEM_PERMISSIONS.FILE_DELETE:action==="download"?SYSTEM_PERMISSIONS.FILE_DOWNLOAD:SYSTEM_PERMISSIONS.FILE_READ;
    if(!this.hasPermission(actor,permission))throw new ForbiddenException(`${permission} permission is required`);
  }

  async assertReferenceAccess(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bizType: string,
    bizId: string | null | undefined,
    action: AccessAction,
    pendingOwnerId?: string,
    protectedFileId?: string
  ): Promise<void> {
    if (!this.isProtectedBizType(bizType)) return;
    if (bizType === "floorplan") {
      const floorAction: FloorAccessAction = action === "upload" || action === "delete"
        ? "write"
        : "read";
      await this.assertFloorReferenceAccess(scope, actor, bizId, floorAction);
      return;
    }
    if (bizType === "party_identity_evidence") {
      await this.assertIdentityEvidenceAccess(
        scope,
        actor,
        bizId,
        action,
        protectedFileId
      );
      return;
    }
    if (bizType === "hr_employee_document" || bizType === "hr_employee_photo") {
      await this.assertHrEmployeeDocumentAccess(scope,actor,bizId,action);
      return;
    }
    if (bizType === "hr_candidate_resume" || bizType === "hr_candidate_offer_evidence") {
      await this.assertHrCandidateDocumentAccess(scope,actor,bizId,action);
      return;
    }
    if (bizType === "hr_employee_credential_evidence") {
      await this.assertHrCredentialDocumentAccess(scope,actor,bizId,action);
      return;
    }
    if (bizType === "hr_lifecycle_checklist_evidence") {
      await this.assertHrLifecycleDocumentAccess(scope,actor,bizId,action);
      return;
    }
    if (bizType === "hr_training_certificate" || bizType === "hr_training_evidence") {
      await this.assertHrTrainingDocumentAccess(scope,actor,bizId,action);
      return;
    }
    if (bizType === "hr_reward_evidence") {
      await this.assertHrRewardDocumentAccess(scope,actor,bizId,action);
      return;
    }
    if (bizType === "hr_contract_document") {
      await this.assertHrContractDocumentAccess(scope,actor,bizId,action);
      return;
    }
    const rule = ACCESS_RULES[bizType];
    const permissions = action === "upload" || action === "delete"
      ? rule.writePermissions
      : rule.readPermissions;
    if (!permissions.some((permission) => this.hasPermission(actor, permission))) {
      throw new ForbiddenException(`One of ${permissions.join(", ")} permissions is required`);
    }
    if (!bizId) {
      if (
        bizType === "housing_purchase"
        && pendingOwnerId === actor.sub
      ) {
        return;
      }
      throw new ForbiddenException("Protected business files require a valid business reference");
    }
    const rows = await this.dataSource.query(
      `SELECT unit_id
       FROM ${rule.referenceTable}
       WHERE id = $1
         AND tenant_id = $2
         AND park_id = $3
         AND is_deleted = false
       LIMIT 1`,
      [bizId, scope.tenantId, scope.parkId]
    ) as Array<{ unit_id: string | null }>;
    const reference = rows[0];
    if (!reference) {
      throw new ForbiddenException("Business file reference is outside the current tenant or park");
    }
    if (reference.unit_id) {
      await this.unitAccessService.assertAccess(scope, actor, reference.unit_id);
    } else if (bizType === "housing_purchase") {
      const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
      if (allowedUnitIds !== null) {
        throw new ForbiddenException("Project-wide purchase files require unrestricted park data scope");
      }
    }
  }

  private async assertHrEmployeeDocumentAccess(scope:TenantParkScope,actor:JwtPrincipal,bizId:string|null|undefined,action:AccessAction):Promise<void>{
    if(!bizId)throw new ForbiddenException("HR employee documents require an employee reference");
    const write=action==="upload"||action==="delete";
    const canManage=this.hasPermission(actor,HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_MANAGE);
    const canReadAll=this.hasPermission(actor,HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_READ);
    const canReadTeam=this.hasPermission(actor,HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_TEAM_READ);
    const canReadSelf=this.hasPermission(actor,HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_SELF_READ);
    if(write&&!canManage)throw new ForbiddenException(`${HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_MANAGE} permission is required`);
    if(!write&&!canManage&&!canReadAll&&!canReadTeam&&!canReadSelf)throw new ForbiddenException("HR employee document read permission is required");
    const rows=await this.dataSource.query(`WITH RECURSIVE managed_org AS (
      SELECT id FROM sys_org WHERE tenant_id=$2 AND park_id=$3 AND leader_user_id=$4 AND is_deleted=false AND status='enabled'
      UNION ALL SELECT child.id FROM sys_org child JOIN managed_org parent ON child.parent_id=parent.id
      WHERE child.tenant_id=$2 AND child.park_id=$3 AND child.is_deleted=false AND child.status='enabled'
    ), actor_employee AS (SELECT id FROM hr_employee WHERE tenant_id=$2 AND park_id=$3 AND user_id=$4 AND is_deleted=false)
    SELECT user_id,(user_id=$4) AS is_self,(primary_org_id IN(SELECT id FROM managed_org) OR manager_employee_id IN(SELECT id FROM actor_employee)) AS is_team
    FROM hr_employee WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false LIMIT 1`,[bizId,scope.tenantId,scope.parkId,actor.sub]) as Array<{user_id:string|null;is_self:boolean;is_team:boolean}>;
    if(!rows[0])throw new ForbiddenException("HR employee reference is outside the current tenant or park");
    if(write||canManage||canReadAll)return;
    if(canReadSelf&&rows[0].is_self)return;
    if(canReadTeam&&rows[0].is_team)return;
    throw new ForbiddenException("HR employee document is outside the actor's employee scope");
  }

  private async assertHrCandidateDocumentAccess(scope:TenantParkScope,actor:JwtPrincipal,bizId:string|null|undefined,action:AccessAction):Promise<void>{
    if(!bizId)throw new ForbiddenException("HR candidate documents require a candidate reference");
    const write=action==="upload"||action==="delete";
    const permission=write?HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_MANAGE:HR_PERMISSIONS.HR_RECRUITMENT_DOCUMENT_READ;
    if(!this.hasPermission(actor,permission))throw new ForbiddenException(`${permission} permission is required`);
    const rows=await this.dataSource.query(`SELECT 1 FROM hr_candidate WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false LIMIT 1`,[bizId,scope.tenantId,scope.parkId]);
    if(!rows[0])throw new ForbiddenException("HR candidate reference is outside the current tenant or park");
  }

  private async assertHrCredentialDocumentAccess(scope:TenantParkScope,actor:JwtPrincipal,bizId:string|null|undefined,action:AccessAction):Promise<void>{
    if(!bizId)throw new ForbiddenException("HR credential evidence requires a credential reference");
    const write=action==="upload"||action==="delete",permission=write?HR_PERMISSIONS.HR_EMPLOYEE_CREDENTIAL_DOCUMENT_MANAGE:HR_PERMISSIONS.HR_EMPLOYEE_CREDENTIAL_DOCUMENT_READ;
    if(!this.hasPermission(actor,permission))throw new ForbiddenException(`${permission} permission is required`);
    const rows=await this.dataSource.query(`SELECT 1 FROM hr_employee_credential c JOIN hr_employee e ON e.tenant_id=c.tenant_id AND e.park_id=c.park_id AND e.id=c.employee_id WHERE c.id=$1 AND c.tenant_id=$2 AND c.park_id=$3 AND c.is_deleted=false AND e.is_deleted=false LIMIT 1`,[bizId,scope.tenantId,scope.parkId]);
    if(!rows[0])throw new ForbiddenException("HR credential reference is outside the current tenant or park");
  }

  private async assertHrLifecycleDocumentAccess(scope:TenantParkScope,actor:JwtPrincipal,bizId:string|null|undefined,action:AccessAction):Promise<void>{
    if(!bizId)throw new ForbiddenException("HR lifecycle evidence requires an item reference");
    const write=action==="upload"||action==="delete",permission=write?HR_PERMISSIONS.HR_LIFECYCLE_DOCUMENT_MANAGE:HR_PERMISSIONS.HR_LIFECYCLE_DOCUMENT_READ;
    if(!this.hasPermission(actor,permission))throw new ForbiddenException(`${permission} permission is required`);
    const rows=await this.dataSource.query(`SELECT 1 FROM hr_lifecycle_checklist_item i JOIN hr_lifecycle_checklist c ON c.tenant_id=i.tenant_id AND c.park_id=i.park_id AND c.id=i.checklist_id JOIN hr_employee e ON e.tenant_id=c.tenant_id AND e.park_id=c.park_id AND e.id=c.employee_id WHERE i.id=$1 AND i.tenant_id=$2 AND i.park_id=$3 AND c.is_deleted=false LIMIT 1`,[bizId,scope.tenantId,scope.parkId]);
    if(!rows[0])throw new ForbiddenException("HR lifecycle reference is outside the current tenant or park");
  }

  private async assertHrTrainingDocumentAccess(scope:TenantParkScope,actor:JwtPrincipal,bizId:string|null|undefined,action:AccessAction):Promise<void>{
    if(!bizId)throw new ForbiddenException("HR training evidence requires a participant reference");
    const write=action==="upload"||action==="delete",permission=write?HR_PERMISSIONS.HR_TRAINING_DOCUMENT_MANAGE:HR_PERMISSIONS.HR_TRAINING_DOCUMENT_READ;
    if(!this.hasPermission(actor,permission))throw new ForbiddenException(`${permission} permission is required`);
    const rows=await this.dataSource.query(`SELECT e.user_id FROM hr_training_participant tp JOIN hr_employee e ON e.tenant_id=tp.tenant_id AND e.park_id=tp.park_id AND e.id=tp.employee_id JOIN hr_training_plan p ON p.tenant_id=tp.tenant_id AND p.park_id=tp.park_id AND p.id=tp.plan_id WHERE tp.id=$1 AND tp.tenant_id=$2 AND tp.park_id=$3 AND p.is_deleted=false LIMIT 1`,[bizId,scope.tenantId,scope.parkId]) as Array<{user_id:string|null}>;
    if(!rows[0])throw new ForbiddenException("HR training reference is outside the current tenant or park");
    if(!write&&!this.hasPermission(actor,HR_PERMISSIONS.HR_TRAINING_READ)&&rows[0].user_id!==actor.sub)throw new ForbiddenException("Employees can only read their own training evidence");
  }

  private async assertHrRewardDocumentAccess(scope:TenantParkScope,actor:JwtPrincipal,bizId:string|null|undefined,action:AccessAction):Promise<void>{
    if(!bizId)throw new ForbiddenException("HR reward evidence requires a case reference");
    const write=action==="upload"||action==="delete",permission=write?HR_PERMISSIONS.HR_REWARD_DOCUMENT_MANAGE:HR_PERMISSIONS.HR_REWARD_DOCUMENT_READ,basePermission=write?HR_PERMISSIONS.HR_REWARD_MANAGE:HR_PERMISSIONS.HR_REWARD_READ;
    if(!this.hasPermission(actor,basePermission)||!this.hasPermission(actor,permission))throw new ForbiddenException(`${basePermission} and ${permission} permissions are required`);
    const rows=await this.dataSource.query(`SELECT status FROM hr_reward_discipline_case WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false LIMIT 1`,[bizId,scope.tenantId,scope.parkId]) as Array<{status:string}>;
    if(!rows[0])throw new ForbiddenException("HR reward reference is outside the current tenant or park");
    if(write&&!['draft','returned'].includes(rows[0].status))throw new ForbiddenException("Reward evidence can only change while the case is draft or returned");
  }

  private async assertHrContractDocumentAccess(scope:TenantParkScope,actor:JwtPrincipal,bizId:string|null|undefined,action:AccessAction):Promise<void>{
    if(!bizId)throw new ForbiddenException("HR contract documents require a contract reference");
    const write=action==="upload"||action==="delete";
    if(write&&!this.hasPermission(actor,HR_PERMISSIONS.HR_CONTRACT_DOCUMENT_MANAGE))throw new ForbiddenException(`${HR_PERMISSIONS.HR_CONTRACT_DOCUMENT_MANAGE} permission is required`);
    const parkRead=this.hasPermission(actor,HR_PERMISSIONS.HR_CONTRACT_DOCUMENT_READ)||this.hasPermission(actor,HR_PERMISSIONS.HR_CONTRACT_DOCUMENT_MANAGE);
    const teamRead=this.hasPermission(actor,HR_PERMISSIONS.HR_CONTRACT_DOCUMENT_TEAM_READ),selfRead=this.hasPermission(actor,HR_PERMISSIONS.HR_CONTRACT_DOCUMENT_SELF_READ);
    if(!write&&!parkRead&&!teamRead&&!selfRead)throw new ForbiddenException("HR contract read permission is required");
    const rows=await this.dataSource.query(`WITH RECURSIVE managed_org AS (
      SELECT id FROM sys_org WHERE tenant_id=$2 AND park_id=$3 AND leader_user_id=$4 AND is_deleted=false AND status='enabled'
      UNION ALL SELECT child.id FROM sys_org child JOIN managed_org parent ON child.parent_id=parent.id
      WHERE child.tenant_id=$2 AND child.park_id=$3 AND child.is_deleted=false AND child.status='enabled'
    ), actor_employee AS (
      SELECT id FROM hr_employee WHERE tenant_id=$2 AND park_id=$3 AND user_id=$4 AND is_deleted=false
    ) SELECT employee.user_id,contract.is_historical_import,(employee.user_id=$4) AS is_self,
        (employee.primary_org_id IN (SELECT id FROM managed_org) OR employee.manager_employee_id IN (SELECT id FROM actor_employee)) AS is_team
      FROM hr_contract contract JOIN hr_employee employee ON employee.id=contract.employee_id AND employee.tenant_id=contract.tenant_id AND employee.park_id=contract.park_id
      WHERE contract.id=$1 AND contract.tenant_id=$2 AND contract.park_id=$3 AND contract.is_deleted=false AND employee.is_deleted=false LIMIT 1`,[bizId,scope.tenantId,scope.parkId,actor.sub]) as Array<{user_id:string|null;is_historical_import:boolean;is_self:boolean;is_team:boolean}>;
    const reference=rows[0];if(!reference)throw new ForbiddenException("HR contract reference is outside the current tenant or park");
    if(write&&reference.is_historical_import)throw new ForbiddenException("Historical imported contract documents are immutable");
    if(write||parkRead)return;
    if(selfRead&&reference.is_self)return;
    if(teamRead&&reference.is_team)return;
    throw new ForbiddenException("Contract document is outside the actor's employee scope");
  }

  assertPendingFileOwner(actor: JwtPrincipal, file: FileEntity): void {
    if (
      this.isProtectedBizType(file.bizType)
      && !file.bizId
      && file.createBy !== actor.sub
    ) {
      throw new ForbiddenException("Unassociated business files are private to their uploader");
    }
  }

  async assertDeletionAllowed(
    scope: TenantParkScope,
    file: FileEntity,
    manager: EntityManager = this.dataSource.manager
  ): Promise<void> {
    if (!this.isProtectedBizType(file.bizType) || !file.bizId) return;
    if (file.bizType === "party_identity_evidence") {
      const references = await manager.query(
        `SELECT 1
         FROM public.rel_party_identity_snapshot_file snapshot_file
         WHERE snapshot_file.tenant_id=$2
           AND snapshot_file.park_id=$3
           AND snapshot_file.file_id=$1::uuid
         UNION ALL
         SELECT 1
         FROM public.rel_party_identity_draft_file draft_file
         WHERE draft_file.tenant_id=$2
           AND draft_file.park_id=$3
           AND draft_file.file_id=$1::uuid
         LIMIT 1`,
        [file.id, scope.tenantId, scope.parkId]
      ) as unknown[];
      if (references.length > 0) {
        throw new ConflictException(
          "Referenced identity evidence cannot be deleted through the generic file endpoint"
        );
      }
      return;
    }
    let sql: string | null = null;
    switch (file.bizType) {
      case "housing_lease_signature":
        sql = `SELECT 1
               FROM biz_housing_lease
               WHERE tenant_id=$2 AND park_id=$3 AND id=$4::uuid
                 AND signature_file_id=$1::uuid AND is_deleted=false`;
        break;
      case "housing_handover":
      case "housing_handover_move_in":
      case "housing_handover_move_out":
        sql = `SELECT 1
               FROM biz_housing_handover
               WHERE tenant_id=$2 AND park_id=$3 AND lease_id=$4::uuid
                 AND (signature_file_id=$1::uuid OR photo_file_ids ? $1::text)
                 AND is_deleted=false`;
        break;
      case "housing_repair":
        sql = `SELECT 1
               FROM biz_work_order
               WHERE tenant_id=$2 AND park_id=$3
                 AND $1::uuid=ANY(image_file_ids)
                 AND is_deleted=false`;
        break;
      case "housing_purchase":
        sql = `SELECT 1
               FROM biz_housing_purchase
               WHERE tenant_id=$2 AND park_id=$3 AND id=$4::uuid
                 AND receipt_file_ids ? $1::text
                 AND is_deleted=false`;
        break;
      case "homestay_turnover":
        sql = `SELECT 1
               FROM biz_homestay_turnover_task
               WHERE tenant_id=$2 AND park_id=$3 AND id=$4::uuid
                 AND photo_file_ids ? $1::text
                 AND is_deleted=false`;
        break;
      case "hr_training_certificate":
        sql = `SELECT 1 FROM hr_training_participant
               WHERE tenant_id=$2 AND park_id=$3 AND id=$4::uuid
                 AND certificate_file_id=$1::uuid
               UNION ALL
               SELECT 1 FROM hr_training_result_correction
               WHERE tenant_id=$2 AND park_id=$3 AND participant_id=$4::uuid
                 AND certificate_file_id=$1::uuid`;
        break;
      case "hr_reward_evidence":
        sql = `SELECT 1 FROM hr_reward_discipline_case WHERE tenant_id=$2 AND park_id=$3 AND id=$4::uuid AND evidence_snapshot ? $1::text AND is_deleted=false`;
        break;
    }
    if (!sql) return;
    const parameters = file.bizType === "housing_repair"
      ? [file.id, scope.tenantId, scope.parkId]
      : [file.id, scope.tenantId, scope.parkId, file.bizId];
    const references = await manager.query(
      `${sql} LIMIT 1`,
      parameters
    ) as Array<{ "?column?": number }>;
    if (references.length > 0) {
      throw new ConflictException(
        "Referenced business evidence cannot be deleted; detach or reverse it through the owning workflow"
      );
    }
  }

  async detachReferencesOnDelete(
    scope: TenantParkScope,
    file: FileEntity,
    actor: JwtPrincipal,
    manager: EntityManager = this.dataSource.manager
  ): Promise<void> {
    if (file.bizType !== "floorplan" || !file.bizId) return;
    await this.assertFloorReferenceAccess(scope, actor, file.bizId, "write", manager);
    await manager.query(
      `UPDATE biz_floor
       SET layout_file_id = NULL,
           layout_url = NULL,
           update_by = $1,
           update_time = now(),
           version = version + 1
       WHERE tenant_id = $2
         AND park_id = $3
         AND id = $4::uuid
         AND layout_file_id = $5::uuid
         AND is_deleted = false`,
      [actor.sub, scope.tenantId, scope.parkId, file.bizId, file.id]
    );
  }

  private async assertFloorReferenceAccess(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    floorId: string | null | undefined,
    action: FloorAccessAction,
    manager: EntityManager = this.dataSource.manager
  ): Promise<void> {
    const permission = action === "write"
      ? SYSTEM_PERMISSIONS.FLOOR_UPLOAD_LAYOUT
      : SYSTEM_PERMISSIONS.FLOOR_READ;
    if (!this.hasPermission(actor, permission)) {
      throw new ForbiddenException(`${permission} permission is required`);
    }
    if (!floorId) {
      throw new ForbiddenException("Floorplan files require a valid floor reference");
    }
    const rows = await manager.query(
      `SELECT id, park_id, building_id
       FROM biz_floor
       WHERE id = $1::uuid
         AND tenant_id = $2
         AND park_id = $3
         AND is_deleted = false
       LIMIT 1`,
      [floorId, scope.tenantId, scope.parkId]
    ) as Array<{ id: string; park_id: string; building_id: string }>;
    const floor = rows[0];
    if (!floor) {
      throw new ForbiddenException("Floorplan reference is outside the current tenant or park");
    }
    if (actor.isSuper || actor.permissions.includes("*")) return;
    const filters = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "floor")
    ]);
    const values = {
      park: floor.park_id,
      building: floor.building_id,
      floor: floor.id
    } as const;
    for (const filter of filters) {
      if (filter.unrestricted) continue;
      const value = values[filter.dimension as keyof typeof values];
      if (value && !filter.allowed_ids.includes(value)) {
        throw new ForbiddenException("Floor is outside current data scope");
      }
    }
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }

  private async assertIdentityEvidenceAccess(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    submissionId: string | null | undefined,
    action: AccessAction,
    fileId?: string
  ): Promise<void> {
    if (!submissionId) {
      throw new ForbiddenException("Identity evidence requires a current submission reference");
    }
    const isOperatorAction = action === "upload" || action === "delete";
    if (!isOperatorAction && !fileId) {
      throw new ForbiddenException(
        "Identity evidence metadata is available only through the identity projection"
      );
    }
    const operatorPermissions = [
      PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE,
      action === "upload" ? SYSTEM_PERMISSIONS.FILE_UPLOAD : SYSTEM_PERMISSIONS.FILE_DELETE
    ];
    const draftOwnerReadPermissions = [
      PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE,
      SYSTEM_PERMISSIONS.FILE_READ,
      ...(action === "download" ? [SYSTEM_PERMISSIONS.FILE_DOWNLOAD] : [])
    ];
    const verifierReadPermissions = [
      PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
      PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ,
      PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY,
      SYSTEM_PERMISSIONS.FILE_READ,
      ...(action === "download" ? [SYSTEM_PERMISSIONS.FILE_DOWNLOAD] : [])
    ];
    const requiredPermissions = isOperatorAction
      ? operatorPermissions
      : this.hasAllPermissions(actor, draftOwnerReadPermissions)
        ? draftOwnerReadPermissions
        : verifierReadPermissions;
    if (!requiredPermissions.every((permission) => this.hasPermission(actor, permission))) {
      throw new ForbiddenException("Identity evidence access is forbidden");
    }

    const baseParams = [
      scope.tenantId,
      scope.parkId,
      submissionId,
      actor.sub
    ];
    if (isOperatorAction) {
      const rows = await this.dataSource.query(
        `SELECT 1
         FROM public.biz_party_identity_submission submission
         JOIN public.biz_party party
           ON party.tenant_id=submission.tenant_id
          AND party.park_id=submission.park_id
          AND party.id=submission.party_id
          AND party.is_deleted=false
         JOIN public.sys_user actor
           ON actor.tenant_id=submission.tenant_id
          AND actor.park_id=submission.park_id
          AND actor.id=$4::uuid
          AND actor.is_deleted=false
          AND actor.is_enabled=true
          AND actor.status='enabled'
         JOIN public.sys_module asset_module
           ON asset_module.module_code='asset'
          AND asset_module.status=1
          AND asset_module.is_deleted=false
         JOIN public.rel_tenant_module asset_assignment
           ON asset_assignment.tenant_id=submission.tenant_id
          AND asset_assignment.park_id=submission.park_id
          AND asset_assignment.module_id=asset_module.id
          AND asset_assignment.enabled=true
          AND asset_assignment.status='enabled'
          AND asset_assignment.is_deleted=false
          AND (asset_assignment.start_time IS NULL OR asset_assignment.start_time<=now())
          AND (asset_assignment.expire_time IS NULL OR asset_assignment.expire_time>now())
        WHERE submission.tenant_id=$1
          AND submission.park_id=$2
          AND submission.id=$3::uuid
          AND submission.status='draft'
          AND submission.drafted_by=$4::uuid
          AND party.current_identity_submission_id=submission.id
          AND party.identity_version=submission.identity_version
          AND ${this.permissionExistsPredicate(5, 6)}
        LIMIT 1`,
        [
          ...baseParams,
          Boolean(actor.isSuper || actor.permissions.includes("*")),
          operatorPermissions
        ]
      ) as unknown[];
      if (rows.length) return;
      throw new ForbiddenException("Identity evidence access is forbidden");
    }

	    if (this.hasAllPermissions(actor, draftOwnerReadPermissions)) {
	      const rows = await this.dataSource.query(
	        `SELECT 1
         FROM public.biz_party_identity_submission submission
         JOIN public.biz_party party
           ON party.tenant_id=submission.tenant_id
          AND party.park_id=submission.park_id
          AND party.id=submission.party_id
          AND party.is_deleted=false
         JOIN public.sys_user actor
           ON actor.tenant_id=submission.tenant_id
          AND actor.park_id=submission.park_id
          AND actor.id=$4::uuid
          AND actor.is_deleted=false
          AND actor.is_enabled=true
          AND actor.status='enabled'
         JOIN public.sys_module asset_module
           ON asset_module.module_code='asset'
          AND asset_module.status=1
          AND asset_module.is_deleted=false
         JOIN public.rel_tenant_module asset_assignment
           ON asset_assignment.tenant_id=submission.tenant_id
          AND asset_assignment.park_id=submission.park_id
          AND asset_assignment.module_id=asset_module.id
          AND asset_assignment.enabled=true
          AND asset_assignment.status='enabled'
          AND asset_assignment.is_deleted=false
          AND (asset_assignment.start_time IS NULL OR asset_assignment.start_time<=now())
          AND (asset_assignment.expire_time IS NULL OR asset_assignment.expire_time>now())
        WHERE submission.tenant_id=$1
          AND submission.park_id=$2
          AND submission.id=$3::uuid
          AND submission.status='draft'
          AND submission.drafted_by=$4::uuid
	          AND party.current_identity_submission_id=submission.id
	          AND party.identity_version=submission.identity_version
	          AND EXISTS (
	            SELECT 1
	            FROM public.rel_party_identity_draft_file draft_file
	            WHERE draft_file.tenant_id=submission.tenant_id
	              AND draft_file.park_id=submission.park_id
	              AND draft_file.submission_id=submission.id
	              AND draft_file.file_id=$5::uuid
	            UNION ALL
	            SELECT 1
	            FROM public.sys_file pending_file
	            WHERE pending_file.tenant_id=submission.tenant_id
	              AND pending_file.park_id=submission.park_id
	              AND pending_file.id=$5::uuid
	              AND pending_file.biz_type='party_identity_evidence'
	              AND pending_file.biz_id=submission.id
	              AND pending_file.create_by=$4::uuid
	              AND pending_file.status=1
	              AND pending_file.is_deleted=false
	          )
	          AND ${this.permissionExistsPredicate(6, 7)}
        LIMIT 1`,
        [
          ...baseParams,
          fileId,
          Boolean(actor.isSuper || actor.permissions.includes("*")),
          draftOwnerReadPermissions
        ]
      ) as unknown[];
      if (rows.length) return;
    }

    if (this.hasAllPermissions(actor, verifierReadPermissions)) {
      const rows = await this.dataSource.query(
        `SELECT 1
         FROM public.biz_party_identity_submission submission
         JOIN public.biz_party party
           ON party.tenant_id=submission.tenant_id
          AND party.park_id=submission.park_id
          AND party.id=submission.party_id
          AND party.is_deleted=false
         JOIN public.biz_party_identity_verification_queue queue
           ON queue.tenant_id=submission.tenant_id
          AND queue.park_id=submission.park_id
          AND queue.id=submission.verification_queue_id
          AND queue.status='active'
         JOIN public.sys_user actor
           ON actor.tenant_id=submission.tenant_id
          AND actor.park_id=submission.park_id
          AND actor.id=$4::uuid
          AND actor.is_deleted=false
          AND actor.is_enabled=true
          AND actor.status='enabled'
         JOIN public.sys_module asset_module
           ON asset_module.module_code='asset'
          AND asset_module.status=1
          AND asset_module.is_deleted=false
         JOIN public.rel_tenant_module asset_assignment
           ON asset_assignment.tenant_id=submission.tenant_id
          AND asset_assignment.park_id=submission.park_id
          AND asset_assignment.module_id=asset_module.id
          AND asset_assignment.enabled=true
          AND asset_assignment.status='enabled'
          AND asset_assignment.is_deleted=false
          AND (asset_assignment.start_time IS NULL OR asset_assignment.start_time<=now())
          AND (asset_assignment.expire_time IS NULL OR asset_assignment.expire_time>now())
        WHERE submission.tenant_id=$1
          AND submission.park_id=$2
          AND submission.id=$3::uuid
          AND submission.status='pending_verification'
          AND submission.assigned_verifier_id=$4::uuid
          AND submission.drafted_by IS DISTINCT FROM $4::uuid
          AND submission.recorded_by IS DISTINCT FROM $4::uuid
          AND submission.submitted_by IS DISTINCT FROM $4::uuid
          AND submission.eligibility_policy_snapshot->>'relationScope'='tenant-park-current'
          AND submission.eligibility_policy_snapshot->>'dataScope'='party-submission'
          AND submission.eligibility_policy_snapshot->'requiredModules' ? 'asset'
          AND submission.eligibility_policy_snapshot->'requiredPermissions'
                ? 'asset:identity-submissions:page'
          AND submission.eligibility_policy_snapshot->'requiredPermissions'
                ? 'party:identity_verify'
          AND submission.eligibility_policy_snapshot->'actorExclusions' ? 'maker'
          AND ${this.permissionExistsPredicate(6, 7)}
          AND (
            NOT (submission.eligibility_policy_snapshot ? 'eligibleVerifierUserIds')
            OR submission.eligibility_policy_snapshot->'eligibleVerifierUserIds' ? $4::text
          )
          AND (
            EXISTS (
              SELECT 1
              FROM public.rel_party_identity_draft_file draft_file
              WHERE draft_file.tenant_id=submission.tenant_id
                AND draft_file.park_id=submission.park_id
                AND draft_file.submission_id=submission.id
                AND draft_file.file_id=$5::uuid
            )
            OR (
              submission.snapshot_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.rel_party_identity_snapshot_file snapshot_file
                WHERE snapshot_file.tenant_id=submission.tenant_id
                  AND snapshot_file.park_id=submission.park_id
                  AND snapshot_file.snapshot_id=submission.snapshot_id
                  AND snapshot_file.file_id=$5::uuid
              )
            )
          )
        LIMIT 1`,
        [
          ...baseParams,
          fileId,
          Boolean(actor.isSuper || actor.permissions.includes("*")),
          verifierReadPermissions
        ]
      ) as unknown[];
      if (rows.length) return;
    }
    throw new ForbiddenException("Identity evidence access is forbidden");
  }

  private hasAllPermissions(actor: JwtPrincipal, permissions: readonly string[]): boolean {
    return permissions.every((permission) => this.hasPermission(actor, permission));
  }

  private permissionExistsPredicate(superParam: number, permissionsParam: number): string {
    return `(
      $${superParam}::boolean
      OR NOT EXISTS (
        SELECT 1
        FROM unnest($${permissionsParam}::varchar[]) required_permission(code)
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.rel_user_role user_role
          JOIN public.sys_role role
            ON role.tenant_id=user_role.tenant_id
           AND role.id=user_role.role_id
           AND (role.role_scope='tenant' OR role.park_id=user_role.park_id)
           AND role.is_enabled=true
           AND role.status='enabled'
           AND role.is_deleted=false
          JOIN public.rel_role_perm role_permission
            ON role_permission.tenant_id=user_role.tenant_id
           AND role_permission.park_id=user_role.park_id
           AND role_permission.role_id=user_role.role_id
           AND role_permission.is_deleted=false
          JOIN public.sys_permission permission
            ON permission.tenant_id=role_permission.tenant_id
           AND permission.id=role_permission.permission_id
           AND permission.is_enabled=true
           AND permission.status='enabled'
           AND permission.is_deleted=false
          WHERE user_role.tenant_id=submission.tenant_id
            AND user_role.park_id=submission.park_id
            AND user_role.user_id=$4::uuid
            AND user_role.is_deleted=false
            AND permission.code=required_permission.code
        )
      )
    )`;
  }
}
