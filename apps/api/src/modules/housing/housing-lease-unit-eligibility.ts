import { ConflictException } from "@nestjs/common";
import {
  HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS,
  isUnitUsageAllowedForPropertyMode,
  type HousingLeaseUnitEligibilityProjection,
  type HousingLeaseUnitEligibilityReason,
  type TenantParkScope
} from "@jinhu/shared";
import type { EntityManager } from "typeorm";

export const HOUSING_LONG_RENT_OPERATION_JOIN = `JOIN biz_property_operation_config operation
  ON operation.unit_id=unit.id
 AND operation.tenant_id=unit.tenant_id
 AND operation.park_id=unit.park_id
 AND operation.is_deleted=false
 AND operation.operating_mode='long_rent'
 AND operation.operating_status='enabled'`;

export const HOUSING_LEASE_UNIT_INELIGIBLE = "housing-lease-unit-ineligible";

type EligibilityRow = {
  unitStatus: number | string;
  usageType: number | string | null;
  operatingMode: string | null;
  operatingStatus: string | null;
};

type LeaseEligibilityRow = EligibilityRow & {
  id: string;
  conflict: boolean;
};

export interface HousingLeaseEligibilityPeriod {
  startAt: string;
  endAt: string;
}

export interface HousingLeaseEligibilityInput {
  id: string;
}

function projectEligibility(row: EligibilityRow | undefined, conflict = false): HousingLeaseUnitEligibilityProjection {
  const reasonCodes: HousingLeaseUnitEligibilityReason[] = [];
  if (!row || Number(row.unitStatus) !== 1) {
    reasonCodes.push(HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS.UNIT_INACTIVE);
  }
  if (row && !isUnitUsageAllowedForPropertyMode("long_rent", Number(row.usageType))) {
    reasonCodes.push(HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS.UNIT_USAGE_NOT_ALLOWED_FOR_MODE);
  }
  if (row && row.operatingMode === null) {
    reasonCodes.push(HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS.OPERATION_CONFIG_MISSING);
  } else if (row && row.operatingMode !== "long_rent") {
    reasonCodes.push(HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS.OPERATION_MODE_NOT_LONG_RENT);
  }
  if (row && row.operatingStatus !== null && row.operatingStatus !== "enabled") {
    reasonCodes.push(HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS.OPERATION_STATUS_NOT_ENABLED);
  }
  if (reasonCodes.length === 0 && conflict) {
    reasonCodes.push(HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS.LEASE_PERIOD_OCCUPIED);
  }
  return { eligible: reasonCodes.length === 0, reasonCodes };
}

export async function projectHousingLeaseUnitEligibility(
  manager: EntityManager,
  scope: TenantParkScope,
  leases: HousingLeaseEligibilityInput[]
): Promise<Map<string, HousingLeaseUnitEligibilityProjection>> {
  if (!leases.length) return new Map();
  const rows = await manager.query(
    `SELECT lease.id,
            unit.status AS "unitStatus",
            unit.usage_type AS "usageType",
            operation.operating_mode AS "operatingMode",
            operation.operating_status AS "operatingStatus",
            EXISTS (
              SELECT 1 FROM biz_property_occupancy occupancy
               WHERE occupancy.tenant_id=lease.tenant_id
                 AND occupancy.park_id=lease.park_id
                 AND occupancy.unit_id=lease.unit_id
                 AND occupancy.is_deleted=false
                 AND occupancy.end_at > lease.start_date::timestamp AT TIME ZONE 'Asia/Shanghai'
                 AND occupancy.start_at < (lease.end_date + interval '1 day')::timestamp AT TIME ZONE 'Asia/Shanghai'
                 AND (occupancy.status='active' OR (
                   occupancy.status='held' AND (occupancy.hold_expires_at IS NULL OR occupancy.hold_expires_at>now())
                 ))
                 AND NOT (
                   occupancy.source_domain='housing_rental'
                   AND occupancy.source_type='housing_lease'
                   AND occupancy.source_id=lease.id::text
                 )
            ) OR EXISTS (
              SELECT 1 FROM rel_leasing_contract_unit relation
              JOIN biz_leasing_contract contract ON contract.id=relation.contract_id
               WHERE relation.tenant_id=lease.tenant_id
                 AND relation.park_id=lease.park_id
                 AND relation.unit_id=lease.unit_id
                 AND relation.is_deleted=false AND relation.status=1
                 AND contract.is_deleted=false AND contract.status NOT IN ('90','91')
                 AND (relation.end_date + interval '1 day')::timestamp AT TIME ZONE 'Asia/Shanghai'
                       > lease.start_date::timestamp AT TIME ZONE 'Asia/Shanghai'
                 AND relation.start_date::timestamp AT TIME ZONE 'Asia/Shanghai'
                       < (lease.end_date + interval '1 day')::timestamp AT TIME ZONE 'Asia/Shanghai'
            ) OR EXISTS (
              SELECT 1 FROM biz_homestay_turnover_task task
               WHERE task.tenant_id=lease.tenant_id
                 AND task.park_id=lease.park_id
                 AND task.unit_id=lease.unit_id
                 AND task.is_deleted=false
                 AND task.status<>'completed'
            ) AS conflict
       FROM biz_housing_lease lease
       LEFT JOIN biz_unit unit
         ON unit.id=lease.unit_id AND unit.tenant_id=lease.tenant_id
        AND unit.park_id=lease.park_id AND unit.is_deleted=false
       LEFT JOIN biz_property_operation_config operation
         ON operation.unit_id=lease.unit_id AND operation.tenant_id=lease.tenant_id
        AND operation.park_id=lease.park_id AND operation.is_deleted=false
      WHERE lease.tenant_id=$1 AND lease.park_id=$2
        AND lease.id=ANY($3::uuid[]) AND lease.is_deleted=false`,
    [scope.tenantId, scope.parkId, leases.map((lease) => lease.id)]
  ) as LeaseEligibilityRow[];
  return new Map(rows.map((row) => [row.id, projectEligibility(row, row.conflict)]));
}

export async function assertHousingLeaseUnitEligible(
  manager: EntityManager,
  scope: TenantParkScope,
  unitId: string,
  period?: HousingLeaseEligibilityPeriod
): Promise<void> {
  await manager.query("SELECT lock_property_unit_scope($1, $2, $3)", [
    scope.tenantId,
    scope.parkId,
    unitId
  ]);
  const rows = await manager.query(
    `SELECT unit.status AS "unitStatus",
            unit.usage_type AS "usageType",
            operation.operating_mode AS "operatingMode",
            operation.operating_status AS "operatingStatus"
       FROM biz_unit unit
       LEFT JOIN biz_property_operation_config operation
         ON operation.unit_id=unit.id
        AND operation.tenant_id=unit.tenant_id
        AND operation.park_id=unit.park_id
        AND operation.is_deleted=false
      WHERE unit.tenant_id=$1 AND unit.park_id=$2 AND unit.id=$3
        AND unit.is_deleted=false
      FOR SHARE OF unit`,
    [scope.tenantId, scope.parkId, unitId]
  ) as EligibilityRow[];
  const row = rows[0];
  const projection = projectEligibility(row);
  const reasonCodes = [...projection.reasonCodes];

  if (reasonCodes.length === 0 && period) {
    const conflicts = await manager.query(
      `SELECT (
         EXISTS (
           SELECT 1 FROM biz_property_occupancy occupancy
            WHERE occupancy.tenant_id=$1 AND occupancy.park_id=$2
              AND occupancy.unit_id=$3 AND occupancy.is_deleted=false
              AND occupancy.end_at>$4::timestamptz
              AND occupancy.start_at<$5::timestamptz
              AND (occupancy.status='active' OR (
                occupancy.status='held' AND (occupancy.hold_expires_at IS NULL OR occupancy.hold_expires_at>now())
              ))
         ) OR EXISTS (
           SELECT 1 FROM rel_leasing_contract_unit relation
           JOIN biz_leasing_contract contract ON contract.id=relation.contract_id
            WHERE relation.tenant_id=$1 AND relation.park_id=$2
              AND relation.unit_id=$3 AND relation.is_deleted=false AND relation.status=1
              AND contract.is_deleted=false AND contract.status NOT IN ('90','91')
              AND (relation.end_date + interval '1 day')::timestamp
                    AT TIME ZONE 'Asia/Shanghai' > $4::timestamptz
              AND relation.start_date::timestamp
                    AT TIME ZONE 'Asia/Shanghai' < $5::timestamptz
         ) OR EXISTS (
           SELECT 1 FROM biz_homestay_turnover_task task
            WHERE task.tenant_id=$1 AND task.park_id=$2
              AND task.unit_id=$3 AND task.is_deleted=false
              AND task.status<>'completed'
         )
       ) AS conflict`,
      [scope.tenantId, scope.parkId, unitId, period.startAt, period.endAt]
    ) as Array<{ conflict: boolean }>;
    if (conflicts[0]?.conflict) {
      reasonCodes.push(HOUSING_LEASE_UNIT_ELIGIBILITY_REASONS.LEASE_PERIOD_OCCUPIED);
    }
  }

  if (reasonCodes.length > 0) {
    throw new ConflictException({
      message: "长租租约房源当前不符合长租资格",
      errorCode: HOUSING_LEASE_UNIT_INELIGIBLE,
      reasonCodes
    });
  }
}
