import { ForbiddenException, Injectable } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import type { FileEntity } from "./entities/file.entity";

export const PROPERTY_BUSINESS_FILE_TYPES = [
  "housing_lease_signature",
  "housing_handover",
  "housing_purchase",
  "homestay_turnover"
] as const;

type PropertyBusinessFileType = (typeof PROPERTY_BUSINESS_FILE_TYPES)[number];
type AccessAction = "read" | "write";

const ACCESS_RULES: Record<PropertyBusinessFileType, {
  readPermission: string;
  writePermission: string;
  referenceTable: string;
}> = {
  housing_lease_signature: {
    readPermission: SYSTEM_PERMISSIONS.HOUSING_LEASE_READ,
    writePermission: SYSTEM_PERMISSIONS.HOUSING_LEASE_SIGN,
    referenceTable: "biz_housing_lease"
  },
  housing_handover: {
    readPermission: SYSTEM_PERMISSIONS.HOUSING_LEASE_READ,
    writePermission: SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
    referenceTable: "biz_housing_lease"
  },
  housing_purchase: {
    readPermission: SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ,
    writePermission: SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE,
    referenceTable: "biz_housing_purchase"
  },
  homestay_turnover: {
    readPermission: SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_READ,
    writePermission: SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_EXECUTE,
    referenceTable: "biz_homestay_turnover_task"
  }
};

@Injectable()
export class FileBusinessAccessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly unitAccessService: PropertyUnitAccessService
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
    const rule = ACCESS_RULES[bizType];
    const permission = action === "write" ? rule.writePermission : rule.readPermission;
    if (!this.hasPermission(actor, permission)) {
      throw new ForbiddenException(`${permission} permission is required`);
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

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }
}
