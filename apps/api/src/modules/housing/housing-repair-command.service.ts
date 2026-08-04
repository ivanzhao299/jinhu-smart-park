import { ConflictException, Injectable } from "@nestjs/common";
import { resolveFileUploadPolicy, type TenantParkScope } from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import type { CreateHousingRepairDto } from "./dto/housing.dto";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";

@Injectable()
export class HousingRepairCommandService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly support: HousingTransactionSupportService
  ) {}

  create(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: CreateHousingRepairDto
  ) {
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.support.lockLease(manager, scope, leaseId);
      await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
      this.support.assertStatus(lease, ["active", "expiring", "checkout_pending"]);
      const files = await this.support.assertFiles(manager, scope, dto.image_file_ids ?? [], {
        allowedMimeTypes: resolveFileUploadPolicy("housing_repair").mimeTypes,
        bizType: "housing_repair",
        bizId: lease.id
      });
      await this.assertFilesUnbound(manager, scope, files.map((file) => file.id));
      const tenant = await this.support.mustParty(manager, scope, lease.tenantPartyId);
      return this.workOrdersService.create(scope, actor, {
        title: dto.title,
        wo_type: "repair",
        priority: dto.priority,
        urgency: dto.urgency,
        source_type: "tenant_request",
        source_id: lease.id,
        unit_id: lease.unitId,
        reporter_name: tenant.displayName,
        reporter_mobile: tenant.mobile ?? undefined,
        description: dto.description,
        image_file_ids: dto.image_file_ids,
        remark: dto.remark ?? `住房租约 ${lease.leaseCode} 代录报修`
      }, manager);
    });
  }

  private async assertFilesUnbound(
    manager: EntityManager,
    scope: TenantParkScope,
    fileIds: string[]
  ) {
    if (!fileIds.length) return;
    const [referencedFile] = await manager.query(
      `SELECT file_id
         FROM unnest($3::uuid[]) AS file_id
        WHERE EXISTS (
          SELECT 1 FROM biz_work_order work_order
           WHERE work_order.tenant_id = $1 AND work_order.park_id = $2
             AND work_order.is_deleted = false
             AND file_id = ANY(work_order.image_file_ids)
        ) LIMIT 1`,
      [scope.tenantId, scope.parkId, fileIds]
    ) as Array<{ file_id: string }>;
    if (referencedFile) {
      throw new ConflictException("One or more repair attachments are already bound to a work order");
    }
  }
}
