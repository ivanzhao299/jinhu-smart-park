import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import {
  SYSTEM_PERMISSIONS,
  type HomestayAvailabilityItem,
  type HomestayAvailabilityListResponse,
  type HomestayAvailabilityResponse,
  type HomestayDashboardResponse,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type Repository } from "typeorm";
import { isPropertyWorkbenchV2Enabled } from "../../shared/property-workbench/property-workbench-v2";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import type { HomestayAvailabilityQueryDto } from "./dto/homestay.dto";
import { HomestayTurnoverTaskEntity } from "./entities/homestay.entities";
import { assertBusinessDate, formatHomestayMoney } from "./homestay-booking.policy";

const HOMESTAY_TIME_ZONE_OFFSET = "+08:00";

interface DashboardSummaryRow {
  arrivals: number;
  departures: number;
  occupied: number;
}

@Injectable()
export class HomestayDashboardAvailabilityQueryService {
  constructor(
    @InjectRepository(HomestayTurnoverTaskEntity)
    private readonly turnoversRepository: Repository<HomestayTurnoverTaskEntity>,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService
  ) {}

  async dashboard(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    businessDate?: string
  ): Promise<HomestayDashboardResponse> {
    if (businessDate) assertBusinessDate(businessDate, "business_date");
    const date = businessDate
      || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    const canReadFinance = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_READ);
    const canReadRates = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOMESTAY_RATE_READ);
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return this.emptyDashboard(date, canReadRates, canReadFinance);
    }
    const parameters = this.scopedDateParameters(scope, date, allowedUnitIds);
    const [summary, pendingTurnovers, rentableUnits, averageDailyRate, revenue] = await Promise.all([
      this.loadDashboardSummary(parameters, allowedUnitIds !== null),
      this.loadPendingTurnovers(scope, allowedUnitIds),
      this.loadRentableUnits(scope, allowedUnitIds),
      canReadRates ? this.loadAverageDailyRate(parameters, allowedUnitIds !== null) : undefined,
      canReadFinance ? this.loadRevenue(parameters, allowedUnitIds !== null) : undefined
    ]);
    const occupied = Number(summary.occupied ?? 0);
    return {
      business_date: date,
      arrivals: summary.arrivals ?? 0,
      departures: summary.departures ?? 0,
      occupied,
      rentable_units: rentableUnits,
      occupancy_rate: rentableUnits > 0 ? ((occupied / rentableUnits) * 100).toFixed(2) : "0.00",
      ...(canReadRates ? { average_daily_rate: formatHomestayMoney(averageDailyRate ?? "0") } : {}),
      pending_turnovers: pendingTurnovers,
      ...(canReadFinance ? { revenue: revenue ?? "0.00" } : {})
    };
  }

  async availability(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayAvailabilityQueryDto
  ): Promise<HomestayAvailabilityResponse | HomestayAvailabilityListResponse> {
    this.assertAvailabilityRange(query.date_from, query.date_to);
    const v2Enabled = isPropertyWorkbenchV2Enabled(this.configService);
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return v2Enabled
        ? { items: [], total: 0, page: query.page, page_size: query.page_size }
        : [];
    }
    const parameters = this.availabilityParameters(scope, query, allowedUnitIds);
    const baseSql = this.availabilityCteSql(allowedUnitIds !== null);
    return v2Enabled
      ? this.loadV2Availability(baseSql, parameters, query)
      : this.loadLegacyAvailability(baseSql, parameters);
  }

  private emptyDashboard(
    date: string,
    canReadRates: boolean,
    canReadFinance: boolean
  ): HomestayDashboardResponse {
    return {
      business_date: date,
      arrivals: 0,
      departures: 0,
      occupied: 0,
      rentable_units: 0,
      occupancy_rate: "0.00",
      ...(canReadRates ? { average_daily_rate: "0.00" } : {}),
      pending_turnovers: 0,
      ...(canReadFinance ? { revenue: "0.00" } : {})
    };
  }

  private scopedDateParameters(
    scope: TenantParkScope,
    date: string,
    allowedUnitIds: string[] | null
  ): unknown[] {
    return allowedUnitIds === null
      ? [scope.tenantId, scope.parkId, date]
      : [scope.tenantId, scope.parkId, date, allowedUnitIds];
  }

  private async loadDashboardSummary(
    parameters: unknown[],
    withUnitScope: boolean
  ): Promise<DashboardSummaryRow> {
    const unitClause = withUnitScope ? " AND booking.unit_id = ANY($4::uuid[])" : "";
    const [summary] = await this.dataSource.query(
      `SELECT
         count(*) FILTER (
           WHERE booking.arrival_date = $3::date
             AND booking.status IN ('confirmed','checked_in','checked_out')
         )::int AS arrivals,
         count(*) FILTER (
           WHERE (booking.status = 'checked_in' AND booking.departure_date = $3::date)
              OR (booking.status = 'checked_out'
                  AND (booking.actual_check_out_time AT TIME ZONE 'Asia/Shanghai')::date = $3::date)
         )::int AS departures,
         count(*) FILTER (
           WHERE booking.arrival_date <= $3::date
             AND booking.departure_date > $3::date
             AND booking.actual_check_in_time IS NOT NULL
             AND (
               booking.status = 'checked_in'
               OR (
                 booking.status = 'checked_out'
                 AND (booking.actual_check_out_time AT TIME ZONE 'Asia/Shanghai')::date > $3::date
               )
             )
         )::int AS occupied
       FROM biz_homestay_booking booking
       WHERE booking.tenant_id = $1 AND booking.park_id = $2 AND booking.is_deleted = false${unitClause}`,
      parameters
    ) as DashboardSummaryRow[];
    return summary ?? { arrivals: 0, departures: 0, occupied: 0 };
  }

  private async loadPendingTurnovers(
    scope: TenantParkScope,
    allowedUnitIds: string[] | null
  ): Promise<number> {
    return this.turnoversRepository.createQueryBuilder("task")
      .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.is_deleted = false")
      .andWhere("task.status <> 'completed'")
      .andWhere(allowedUnitIds === null ? "1=1" : "task.unit_id IN (:...allowedUnitIds)", {
        allowedUnitIds: allowedUnitIds ?? []
      })
      .getCount();
  }

  private async loadRevenue(parameters: unknown[], withUnitScope: boolean): Promise<string> {
    const unitClause = withUnitScope ? " AND booking.unit_id = ANY($4::uuid[])" : "";
    const [finance] = await this.dataSource.query(
      `SELECT COALESCE(sum(CASE WHEN entry.entry_type = 'payment' THEN entry.amount
                               WHEN entry.entry_type = 'refund' THEN -entry.amount ELSE 0 END), 0)::text AS revenue
       FROM biz_homestay_ledger_entry entry
       JOIN biz_homestay_booking booking ON booking.id = entry.booking_id
       WHERE entry.tenant_id = $1 AND entry.park_id = $2
         AND entry.is_deleted = false AND entry.status = 'confirmed'
         AND (entry.occurred_at AT TIME ZONE 'Asia/Shanghai')::date = $3::date${unitClause}`,
      parameters
    ) as Array<{ revenue: string }>;
    return finance?.revenue ?? "0.00";
  }

  private async loadRentableUnits(
    scope: TenantParkScope,
    allowedUnitIds: string[] | null
  ): Promise<number> {
    const parameters: unknown[] = [scope.tenantId, scope.parkId];
    const unitClause = allowedUnitIds === null ? "" : " AND config.unit_id = ANY($3::uuid[])";
    if (allowedUnitIds !== null) parameters.push(allowedUnitIds);
    const [capacity] = await this.dataSource.query(
      `SELECT count(*)::int AS rentable_units
       FROM biz_property_operation_config config
       JOIN biz_unit unit
         ON unit.id = config.unit_id
        AND unit.tenant_id = config.tenant_id
        AND unit.park_id = config.park_id
        AND unit.is_deleted = false
        AND unit.status = 1
       WHERE config.tenant_id = $1
        AND config.park_id = $2
        AND config.is_deleted = false
        AND config.operating_mode = 'short_stay'
        AND config.operating_status = 'enabled'${unitClause}`,
      parameters
    ) as Array<{ rentable_units: number }>;
    return Number(capacity?.rentable_units ?? 0);
  }

  private async loadAverageDailyRate(
    parameters: unknown[],
    withUnitScope: boolean
  ): Promise<string> {
    const unitClause = withUnitScope ? " AND booking.unit_id = ANY($4::uuid[])" : "";
    const [rateSummary] = await this.dataSource.query(
      `SELECT round(COALESCE(avg(night.final_rate), 0), 2)::text AS average_daily_rate
       FROM biz_homestay_booking_night night
       JOIN biz_homestay_booking booking ON booking.id = night.booking_id
       WHERE night.tenant_id = $1
         AND night.park_id = $2
         AND night.is_deleted = false
         AND booking.is_deleted = false
         AND (
           booking.status IN ('confirmed', 'checked_in')
           OR (
             booking.status = 'checked_out'
             AND (booking.actual_check_out_time AT TIME ZONE 'Asia/Shanghai')::date > $3::date
           )
         )
         AND night.business_date = $3::date${unitClause}`,
      parameters
    ) as Array<{ average_daily_rate: string }>;
    return rateSummary?.average_daily_rate ?? "0";
  }

  private assertAvailabilityRange(startValue: string, endValue: string): void {
    assertBusinessDate(startValue, "arrival_date");
    assertBusinessDate(endValue, "departure_date");
    const start = this.businessDateStart(startValue);
    const end = this.businessDateStart(endValue);
    if (start >= end) {
      throw new BadRequestException("arrival_date must be before departure_date");
    }
    if ((end.getTime() - start.getTime()) / 86_400_000 > 366) {
      throw new BadRequestException("A booking cannot exceed 366 nights");
    }
  }

  private businessDateStart(value: string): Date {
    return new Date(`${value.slice(0, 10)}T00:00:00${HOMESTAY_TIME_ZONE_OFFSET}`);
  }

  private availabilityParameters(
    scope: TenantParkScope,
    query: HomestayAvailabilityQueryDto,
    allowedUnitIds: string[] | null
  ): unknown[] {
    const parameters: unknown[] = [
      scope.tenantId,
      scope.parkId,
      this.businessDateStart(query.date_from).toISOString(),
      this.businessDateStart(query.date_to).toISOString()
    ];
    if (allowedUnitIds !== null) parameters.push(allowedUnitIds);
    return parameters;
  }

  private async loadLegacyAvailability(
    baseSql: string,
    parameters: unknown[]
  ): Promise<HomestayAvailabilityResponse> {
    const rows = await this.dataSource.query(
      `${baseSql}
       SELECT unit_id, unit_code, unit_name, operation_mode, room_state
       FROM availability ORDER BY unit_code`,
      parameters
    ) as HomestayAvailabilityItem[];
    return this.projectAvailabilityRows(rows);
  }

  private async loadV2Availability(
    baseSql: string,
    parameters: unknown[],
    query: HomestayAvailabilityQueryDto
  ): Promise<HomestayAvailabilityListResponse> {
    const limitIndex = parameters.length + 1;
    const offsetIndex = parameters.length + 2;
    const [rows, countRows] = await Promise.all([
      this.dataSource.query(
        `${baseSql}
         SELECT unit_id, unit_code, unit_name, operation_mode, room_state
         FROM availability
         ORDER BY unit_code
         LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        [...parameters, query.page_size, (query.page - 1) * query.page_size]
      ) as Promise<HomestayAvailabilityItem[]>,
      this.dataSource.query(
        `${baseSql} SELECT count(*)::int AS total FROM availability`,
        parameters
      ) as Promise<Array<{ total: number }>>
    ]);
    return {
      items: this.projectAvailabilityRows(rows),
      total: Number(countRows[0]?.total ?? 0),
      page: query.page,
      page_size: query.page_size
    };
  }

  private projectAvailabilityRows(rows: HomestayAvailabilityItem[]): HomestayAvailabilityItem[] {
    return rows.map((row) => ({
      unit_id: row.unit_id,
      unit_code: row.unit_code,
      unit_name: row.unit_name,
      operation_mode: row.operation_mode,
      room_state: row.room_state
    }));
  }

  private availabilityCteSql(withUnitScope: boolean): string {
    const unitClause = withUnitScope ? " AND unit.id = ANY($5::uuid[])" : "";
    return `WITH availability AS (
      SELECT unit.id AS unit_id, unit.unit_code, unit.unit_name,
             mode.operating_mode AS operation_mode,
        CASE
          WHEN unit.status <> 1 THEN 'out_of_service'
          WHEN mode.operating_mode IS DISTINCT FROM 'short_stay' THEN 'mode_unavailable'
          WHEN mode.operating_status IS DISTINCT FROM 'enabled' THEN 'out_of_service'
          WHEN count(turnover.id) > 0 THEN 'turnover'
          WHEN bool_or(occupancy.source_type = 'homestay_turnover') THEN 'turnover'
          WHEN bool_or(
            occupancy.source_type = 'homestay_booking'
            AND homestay_booking.status = 'checked_in'
            AND homestay_booking.actual_check_in_time IS NOT NULL
          ) THEN 'occupied'
          WHEN bool_or(
            occupancy.source_type = 'homestay_booking'
            AND occupancy.status = 'active'
            AND homestay_booking.status = 'confirmed'
            AND homestay_booking.actual_check_in_time IS NULL
          ) THEN 'reserved'
          WHEN bool_or(
            occupancy.source_type = 'homestay_booking'
            AND occupancy.status = 'held'
          ) THEN 'held'
          WHEN bool_or(
            occupancy.status IN ('held', 'active')
            AND occupancy.source_type <> 'homestay_booking'
          ) THEN 'occupied'
          WHEN EXISTS (
            SELECT 1
            FROM rel_leasing_contract_unit lease_unit
            INNER JOIN biz_leasing_contract contract
              ON contract.id = lease_unit.contract_id
             AND contract.tenant_id = lease_unit.tenant_id
             AND contract.park_id = lease_unit.park_id
             AND contract.is_deleted = false
             AND contract.status NOT IN ('90', '91')
            WHERE lease_unit.tenant_id = unit.tenant_id
              AND lease_unit.park_id = unit.park_id
              AND lease_unit.unit_id = unit.id
              AND lease_unit.status = 1
              AND lease_unit.is_deleted = false
              AND (lease_unit.start_date::timestamp AT TIME ZONE 'Asia/Shanghai') < $4::timestamptz
              AND ((lease_unit.end_date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai') > $3::timestamptz
          ) THEN 'occupied'
          ELSE 'available'
        END AS room_state
      FROM biz_unit unit
      LEFT JOIN biz_property_operation_config mode
        ON mode.tenant_id = unit.tenant_id
       AND mode.park_id = unit.park_id
       AND mode.unit_id = unit.id
       AND mode.is_deleted = false
      LEFT JOIN biz_property_occupancy occupancy
        ON occupancy.tenant_id = unit.tenant_id
       AND occupancy.park_id = unit.park_id
       AND occupancy.unit_id = unit.id
       AND occupancy.is_deleted = false
       AND occupancy.status IN ('held', 'active')
       AND (occupancy.status <> 'held' OR occupancy.hold_expires_at IS NULL
            OR occupancy.hold_expires_at > now())
       AND occupancy.start_at < $4::timestamptz
       AND occupancy.end_at > $3::timestamptz
      LEFT JOIN biz_homestay_booking homestay_booking
        ON occupancy.source_type = 'homestay_booking'
       AND homestay_booking.id::text = occupancy.source_id
       AND homestay_booking.tenant_id = occupancy.tenant_id
       AND homestay_booking.park_id = occupancy.park_id
       AND homestay_booking.unit_id = occupancy.unit_id
       AND homestay_booking.is_deleted = false
      LEFT JOIN biz_homestay_turnover_task turnover
        ON turnover.tenant_id = unit.tenant_id
       AND turnover.park_id = unit.park_id
       AND turnover.unit_id = unit.id
       AND turnover.is_deleted = false
       AND turnover.status <> 'completed'
      WHERE unit.tenant_id = $1 AND unit.park_id = $2
        AND unit.is_deleted = false${unitClause}
      GROUP BY unit.id, unit.unit_code, unit.unit_name,
               mode.operating_mode, mode.operating_status
    )`;
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }
}
