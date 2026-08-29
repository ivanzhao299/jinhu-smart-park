import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import { UnitStatusLogEntity } from "../units/entities/unit-status-log.entity";
import { UnitEntity } from "../units/entities/unit.entity";

const AVAILABLE = 10;
const RENTED = 30;
const STRONG_STATUSES = new Set([20, 50, 60, 70]);

export type RentalStatusProjectionResult = {
  disposition: "changed" | "unchanged" | "kept_occupied" | "kept_strong_status";
  beforeStatus: number;
  afterStatus: number;
};

type ProjectionInput = {
  manager: EntityManager;
  scope: TenantParkScope;
  unitId: string;
  actorId: string;
  actorName?: string | null;
  sourceType: "housing_lease" | "homestay_booking";
  sourceId: string;
  action: "occupy" | "release";
};

@Injectable()
export class RentalStatusProjectionService {
  async project(input: ProjectionInput): Promise<RentalStatusProjectionResult> {
    await input.manager.query("SELECT lock_property_unit_scope($1, $2, $3)", [
      input.scope.tenantId,
      input.scope.parkId,
      input.unitId
    ]);
    const units = input.manager.getRepository(UnitEntity);
    const unit = await units.findOne({
      where: {
        id: input.unitId,
        tenantId: input.scope.tenantId,
        parkId: input.scope.parkId,
        isDeleted: false
      },
      lock: { mode: "pessimistic_write" }
    });
    if (!unit) throw new NotFoundException("Unit not found");
    if (unit.status !== 1) throw new ConflictException("Inactive unit rental status cannot change");

    const beforeStatus = unit.rentalStatus;
    if (input.action === "occupy") {
      if (STRONG_STATUSES.has(beforeStatus)) {
        throw new ConflictException(`Unit rental status ${beforeStatus} blocks occupancy`);
      }
      if (beforeStatus !== AVAILABLE && beforeStatus !== RENTED) {
        throw new ConflictException(`Unit rental status ${beforeStatus} cannot become rented`);
      }
      return this.persist(input, unit, RENTED);
    }

    if (STRONG_STATUSES.has(beforeStatus)) {
      return { disposition: "kept_strong_status", beforeStatus, afterStatus: beforeStatus };
    }
    if (beforeStatus !== RENTED && beforeStatus !== 40) {
      return { disposition: "unchanged", beforeStatus, afterStatus: beforeStatus };
    }
    if (await this.hasBlockingBusiness(input)) {
      if (beforeStatus === 40) {
        const changed = await this.persist(input, unit, RENTED);
        return { ...changed, disposition: "kept_occupied" };
      }
      return { disposition: "kept_occupied", beforeStatus, afterStatus: beforeStatus };
    }
    return this.persist(input, unit, AVAILABLE);
  }

  private async persist(input: ProjectionInput, unit: UnitEntity, afterStatus: number) {
    const beforeStatus = unit.rentalStatus;
    if (beforeStatus === afterStatus) {
      return { disposition: "unchanged", beforeStatus, afterStatus } as RentalStatusProjectionResult;
    }
    unit.rentalStatus = afterStatus;
    unit.statusUpdateTime = new Date();
    unit.statusUpdateBy = input.actorId;
    unit.updateBy = input.actorId;
    await input.manager.getRepository(UnitEntity).save(unit);
    const logs = input.manager.getRepository(UnitStatusLogEntity);
    await logs.save(logs.create({
      tenantId: input.scope.tenantId,
      parkId: input.scope.parkId,
      unitId: unit.id,
      beforeStatus,
      afterStatus,
      reason: `${input.sourceType}:${input.sourceId}:${input.action}`,
      sourceType: "system",
      operatorId: input.actorId,
      operatorName: input.actorName?.trim() || null,
      opTime: new Date(),
      createBy: input.actorId,
      updateBy: input.actorId,
      remark: "LEA-004 lifecycle rental-status projection"
    }));
    return { disposition: "changed", beforeStatus, afterStatus } as RentalStatusProjectionResult;
  }

  private async hasBlockingBusiness(input: ProjectionInput) {
    const rows = await input.manager.query(
      `SELECT EXISTS (
         SELECT 1 FROM biz_property_occupancy occupancy
          WHERE occupancy.tenant_id=$1 AND occupancy.park_id=$2 AND occupancy.unit_id=$3
            AND occupancy.is_deleted=false
            AND (occupancy.status='active' OR (occupancy.status='held'
              AND occupancy.hold_expires_at IS NOT NULL AND occupancy.hold_expires_at>clock_timestamp()))
            AND occupancy.source_domain IN ('commercial_leasing','housing_rental','homestay')
         UNION ALL
         SELECT 1 FROM biz_housing_lease lease
          WHERE lease.tenant_id=$1 AND lease.park_id=$2 AND lease.unit_id=$3
            AND lease.is_deleted=false AND lease.status IN ('active','expiring','checkout_pending')
         UNION ALL
         SELECT 1 FROM biz_homestay_booking booking
          WHERE booking.tenant_id=$1 AND booking.park_id=$2 AND booking.unit_id=$3
            AND booking.is_deleted=false AND booking.status IN ('confirmed','checked_in')
         UNION ALL
         SELECT 1 FROM rel_leasing_contract_unit relation
          JOIN biz_leasing_contract contract ON contract.id=relation.contract_id
            AND contract.tenant_id=relation.tenant_id AND contract.park_id=relation.park_id
          WHERE relation.tenant_id=$1 AND relation.park_id=$2 AND relation.unit_id=$3
            AND relation.is_deleted=false AND relation.status=1
            AND contract.is_deleted=false AND contract.status='75'
            AND contract.effective_date IS NOT NULL
            AND contract.effective_date
                <= (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date
            AND (relation.end_date + interval '1 day')
                > (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date
       ) AS blocked`,
      [input.scope.tenantId, input.scope.parkId, input.unitId]
    ) as Array<{ blocked: boolean }>;
    return rows[0]?.blocked === true;
  }
}
