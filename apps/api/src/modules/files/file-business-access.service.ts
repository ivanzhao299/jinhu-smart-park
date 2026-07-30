import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
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
  "floorplan"
] as const;

type PropertyBusinessFileType = (typeof PROPERTY_BUSINESS_FILE_TYPES)[number];
type RuleBasedPropertyBusinessFileType = Exclude<PropertyBusinessFileType, "floorplan">;
type AccessAction = "read" | "write";

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
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE
    ],
    writePermissions: [SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE],
    referenceTable: "biz_housing_lease"
  },
  housing_handover_move_in: {
    readPermissions: [
      SYSTEM_PERMISSIONS.HOUSING_LEASE_READ,
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE
    ],
    writePermissions: [SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE],
    referenceTable: "biz_housing_lease"
  },
  housing_handover_move_out: {
    readPermissions: [
      SYSTEM_PERMISSIONS.HOUSING_LEASE_READ,
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE
    ],
    writePermissions: [SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE],
    referenceTable: "biz_housing_lease"
  },
  housing_repair: {
    readPermissions: [
      SYSTEM_PERMISSIONS.HOUSING_LEASE_READ,
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

  async assertReferenceAccess(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bizType: string,
    bizId: string | null | undefined,
    action: AccessAction,
    pendingOwnerId?: string
  ): Promise<void> {
    if (!this.isProtectedBizType(bizType)) return;
    if (bizType === "floorplan") {
      await this.assertFloorReferenceAccess(scope, actor, bizId, action);
      return;
    }
    const rule = ACCESS_RULES[bizType];
    const permissions = action === "write" ? rule.writePermissions : rule.readPermissions;
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
    }
    if (!sql) return;
    const references = await manager.query(
      `${sql} LIMIT 1`,
      [file.id, scope.tenantId, scope.parkId, file.bizId]
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
    action: AccessAction,
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
}
