import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  SYSTEM_PERMISSIONS,
  type HomestayAvailabilityListResponse,
  type HomestayAvailabilityResponse,
  type HomestayBookingDetailResponse,
  type HomestayBookingListItem,
  type HomestayBookingListResponse,
  type HomestayBookingResponse,
  type HomestayCredentialResponse,
  type HomestayDashboardResponse,
  type HomestayRateCalendarResponse,
  type HomestayStayListItem,
  type HomestayStayListResponse,
  type HomestayTurnoverDetailResponse,
  type HomestayTurnoverListItem,
  type HomestayTurnoverListResponse,
  type HomestayTurnoverResponse,
  type IdentityVerificationPort,
  type HomestayUnitCandidateListResponse,
  type PropertyWorkbenchFileRef,
  type PropertyApprovalCommandPort,
  type PropertyApprovalJsonValue,
  type TenantParkScope
} from "@jinhu/shared";
import { randomUUID } from "node:crypto";
import {
  DataSource,
  type EntityManager,
  type Repository,
  type SelectQueryBuilder
} from "typeorm";
import {
  assertPropertyHighRiskActionApprovalRequired,
  assertPropertyHighRiskActionPermissions
} from "../../shared/property-workbench/property-high-risk-stopship";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FileEntity } from "../files/entities/file.entity";
import { PartyEntity } from "../property-operations/entities/party.entity";
import { PropertyOperationConfigEntity } from "../property-operations/entities/property-operation-config.entity";
import { PropertyOccupancyEntity } from "../property-operations/entities/property-occupancy.entity";
import { PropertyOccupanciesService } from "../property-operations/property-occupancies.service";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { UnitEntity } from "../units/entities/unit.entity";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import { PropertyIdentityVerificationService } from "../property-identity/property-identity-verification.service";
import type {
  AddHomestayGuestDto,
  CreateHomestayBookingDto,
  ExecuteHomestayTurnoverDto,
  HomestayAvailabilityQueryDto,
  HomestayBookingQueryDto,
  HomestayStayQueryDto,
  HomestayTurnoverQueryDto,
  HomestayUnitCandidateQueryDto,
  IssueHomestayCredentialDto,
  RegisterHomestayLedgerEntryDto,
  RescheduleHomestayBookingDto,
  UpsertHomestayRateDto,
  UpsertHomestayRateOverrideDto
} from "./dto/homestay.dto";
import {
  HomestayBookingActionLogEntity,
  HomestayBookingEntity,
  HomestayBookingGuestEntity,
  HomestayBookingNightEntity,
  HomestayLedgerEntryEntity,
  HomestayRateConfigEntity,
  HomestayRateOverrideEntity,
  HomestayStayCredentialEntity,
  HomestayTurnoverTaskEntity
} from "./entities/homestay.entities";
import {
  assertBusinessDate,
  assertHomestayCheckInWindow,
  assertHomestayGuestIdentityVerified,
  assertHomestayGuestRegistrationOpen,
  assertHomestayGuestRosterComplete,
  assertHomestayMoneyFitsNumeric,
  assertHomestayNoShowWindow,
  formatHomestayMoney,
  formatMoneyCents,
  homestayMoneyDifference,
  toMoneyCents,
  turnoverLockEnd
} from "./homestay-booking.policy";
import {
  assertHomestayManualLedgerMutation,
  calculateCancellableRoomCharge,
  formatHomestayLedgerSummary,
  summarizeHomestayLedger
} from "./homestay-finance.policy";
import { HomestayWorkbenchQueryService } from "./homestay-workbench-query.service";
import { HomestayDashboardAvailabilityQueryService } from "./homestay-dashboard-availability-query.service";
import { propertyApprovalCanonicalHash } from "../property-approvals/property-approval.service";

const HOMESTAY_TIME_ZONE_OFFSET = "+08:00";
const HOLD_MINUTES = 30;

interface BookingDetailAccess {
  canReadFinance: boolean;
  canReadTurnover: boolean;
  canReadTurnoverFiles: boolean;
}

interface BookingDetailRelations {
  nights: HomestayBookingNightEntity[];
  guests: HomestayBookingGuestEntity[];
  credentials: HomestayStayCredentialEntity[];
  ledger: HomestayLedgerEntryEntity[];
  actions: HomestayBookingActionLogEntity[];
  turnover: HomestayTurnoverTaskEntity | null;
  guestDisplayNames: ReadonlyMap<string, string>;
}

interface HomestayLedgerSnapshotRow {
  id: string;
  version: number;
  entryType: "charge" | "payment" | "refund" | "waiver";
  chargeType: string;
  amount: string;
  currency: string;
  status: "confirmed";
  sourceLedgerEntryId: string | null;
  recordedBy: string | null;
}

interface HomestayLegacyFinanceMappingRow {
  resultId: string;
  sourceExpectedVersion: number;
  currency: string;
}

@Injectable()
export class HomestayService {
  constructor(
    @InjectRepository(HomestayRateConfigEntity)
    private readonly ratesRepository: Repository<HomestayRateConfigEntity>,
    @InjectRepository(HomestayRateOverrideEntity)
    private readonly overridesRepository: Repository<HomestayRateOverrideEntity>,
    @InjectRepository(HomestayBookingEntity)
    private readonly bookingsRepository: Repository<HomestayBookingEntity>,
    @InjectRepository(HomestayTurnoverTaskEntity)
    private readonly turnoversRepository: Repository<HomestayTurnoverTaskEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    @InjectRepository(WorkOrderEntity)
    private readonly workOrdersRepository: Repository<WorkOrderEntity>,
    private readonly propertyOccupanciesService: PropertyOccupanciesService,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataSource: DataSource,
    _configService: ConfigService = new ConfigService(),
    @Optional()
    private readonly workbenchQuery?: HomestayWorkbenchQueryService,
    @Optional()
    @Inject(PROPERTY_APPROVAL_COMMAND_PORT)
    private readonly approvalCommands?: PropertyApprovalCommandPort,
    @Optional()
    private readonly identityVerifier?: PropertyIdentityVerificationService,
    @Optional()
    private readonly dashboardAvailabilityQuery?: HomestayDashboardAvailabilityQueryService
  ) {}

  async listUnitCandidates(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayUnitCandidateQueryDto
  ): Promise<HomestayUnitCandidateListResponse> {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return { items: [], total: 0, page: query.page, page_size: query.page_size };
    }
    const itemAccessClause = allowedUnitIds === null ? "" : " AND unit.id = ANY($5::uuid[])";
    const countAccessClause = allowedUnitIds === null ? "" : " AND unit.id = ANY($3::uuid[])";
    const params = allowedUnitIds === null
      ? [scope.tenantId, scope.parkId, query.page_size, (query.page - 1) * query.page_size]
      : [scope.tenantId, scope.parkId, query.page_size, (query.page - 1) * query.page_size, allowedUnitIds];
    const commonSql = (accessClause: string) => `
      FROM biz_unit unit
      JOIN biz_property_operation_config operation
        ON operation.unit_id = unit.id
       AND operation.tenant_id = unit.tenant_id
       AND operation.park_id = unit.park_id
       AND operation.is_deleted = false
       AND operation.operating_mode = 'short_stay'
       AND operation.operating_status = 'enabled'
      WHERE unit.tenant_id = $1
        AND unit.park_id = $2
        AND unit.status = 1
        AND unit.is_deleted = false${accessClause}`;
    const [items, countRows] = await Promise.all([
      this.dataSource.query(
        `SELECT unit.id, unit.unit_code AS "unitCode", unit.unit_name AS "unitName"
         ${commonSql(itemAccessClause)}
         ORDER BY unit.unit_code ASC
         LIMIT $3 OFFSET $4`,
        params
      ) as Promise<Array<{ id: string; unitCode: string; unitName: string }>>,
      this.dataSource.query(
        `SELECT count(*)::int AS total ${commonSql(countAccessClause)}`,
        allowedUnitIds === null
          ? [scope.tenantId, scope.parkId]
          : [scope.tenantId, scope.parkId, allowedUnitIds]
      ) as Promise<Array<{ total: number }>>
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async getRateCalendar(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    unitId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<HomestayRateCalendarResponse> {
    if (!dateFrom || !dateTo) {
      throw new BadRequestException("date_from and date_to are required");
    }
    assertBusinessDate(dateFrom, "date_from");
    assertBusinessDate(dateTo, "date_to");
    await this.assertUnitReadScope(scope, actor, unitId);
    const dates = this.businessDates(dateFrom, dateTo);
    const config = await this.mustFindRate(scope, unitId);
    const overrides = await this.overridesRepository.createQueryBuilder("rate")
      .where("rate.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rate.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rate.unit_id = :unitId", { unitId })
      .andWhere("rate.is_deleted = false")
      .andWhere("rate.business_date >= :dateFrom", { dateFrom })
      .andWhere("rate.business_date < :dateTo", { dateTo })
      .getMany();
    const byDate = new Map(overrides.map((item) => [item.businessDate, item]));
    return {
      unit_id: unitId,
      currency: config.currency,
      base_daily_rate: config.baseDailyRate,
      checkout_requires_inspection: config.checkoutRequiresInspection,
      cancellation_policy: this.cancellationSnapshot(config),
      days: dates.map((date) => {
        const override = byDate.get(date);
        return {
          business_date: date,
          base_rate: config.baseDailyRate,
          override_rate: override?.dailyRate ?? null,
          final_rate: override?.dailyRate ?? config.baseDailyRate,
          price_source: override ? "date_override" : "base"
        };
      })
    };
  }

  async upsertRate(scope: TenantParkScope, actor: JwtPrincipal, unitId: string, dto: UpsertHomestayRateDto) {
    await this.unitAccessService.assertAccess(scope, actor, unitId);
    if (dto.late_cancel_fee_type === "percentage" && toMoneyCents(dto.late_cancel_fee_value) > 10_000n) {
      throw new BadRequestException("Percentage cancellation fee cannot exceed 100");
    }
    await this.dataSource.query(
      `INSERT INTO biz_homestay_rate_config (
         tenant_id, park_id, unit_id, base_daily_rate, currency,
         free_cancel_before_hours, late_cancel_fee_type, late_cancel_fee_value,
         checkout_requires_inspection, create_by, update_by
       ) VALUES ($1, $2, $3, $4, 'CNY', $5, $6, $7, $8, $9, $9)
       ON CONFLICT (tenant_id, park_id, unit_id) WHERE is_deleted = false
       DO UPDATE SET
         base_daily_rate = EXCLUDED.base_daily_rate,
         currency = EXCLUDED.currency,
         free_cancel_before_hours = EXCLUDED.free_cancel_before_hours,
         late_cancel_fee_type = EXCLUDED.late_cancel_fee_type,
         late_cancel_fee_value = EXCLUDED.late_cancel_fee_value,
         checkout_requires_inspection = EXCLUDED.checkout_requires_inspection,
         update_by = EXCLUDED.update_by,
         update_time = now(),
         version = biz_homestay_rate_config.version + 1`,
      [
        scope.tenantId,
        scope.parkId,
        unitId,
        formatHomestayMoney(dto.base_daily_rate),
        dto.free_cancel_before_hours,
        dto.late_cancel_fee_type,
        formatHomestayMoney(dto.late_cancel_fee_value),
        dto.checkout_requires_inspection,
        actor.sub
      ]
    );
    return this.mustFindRate(scope, unitId);
  }

  async upsertRateOverride(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    unitId: string,
    dto: UpsertHomestayRateOverrideDto
  ) {
    await this.unitAccessService.assertAccess(scope, actor, unitId);
    await this.mustFindRate(scope, unitId);
    const businessDate = dto.business_date.slice(0, 10);
    await this.dataSource.query(
      `INSERT INTO biz_homestay_rate_override (
         tenant_id, park_id, unit_id, business_date, daily_rate, reason,
         create_by, update_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (tenant_id, park_id, unit_id, business_date) WHERE is_deleted = false
       DO UPDATE SET
         daily_rate = EXCLUDED.daily_rate,
         reason = EXCLUDED.reason,
         update_by = EXCLUDED.update_by,
         update_time = now(),
         version = biz_homestay_rate_override.version + 1`,
      [
        scope.tenantId,
        scope.parkId,
        unitId,
        businessDate,
        formatHomestayMoney(dto.daily_rate),
        dto.reason.trim(),
        actor.sub
      ]
    );
    const entity = await this.overridesRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId, businessDate, isDeleted: false }
    });
    if (!entity) throw new NotFoundException("Homestay rate override not found after upsert");
    return entity;
  }

  async listBookings(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayBookingQueryDto
  ): Promise<HomestayBookingListResponse> {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return { items: [], total: 0, page: query.page, page_size: query.page_size };
    }
    const builder = this.bookingsRepository.createQueryBuilder("booking")
      .where("booking.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("booking.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("booking.is_deleted = false");
    if (allowedUnitIds !== null) builder.andWhere("booking.unit_id IN (:...allowedUnitIds)", { allowedUnitIds });
    if (query.status) builder.andWhere("booking.status = :status", { status: query.status });
    if (query.unit_id) builder.andWhere("booking.unit_id = :unitId", { unitId: query.unit_id });
    if (query.keyword) {
      builder.andWhere("booking.booking_code ILIKE :bookingKeyword", {
        bookingKeyword: `%${query.keyword}%`
      });
    }
    if (query.date_from) builder.andWhere("booking.departure_date > :dateFrom", { dateFrom: query.date_from.slice(0, 10) });
    if (query.date_to) builder.andWhere("booking.arrival_date < :dateTo", { dateTo: query.date_to.slice(0, 10) });
    const [bookings, total] = await builder
      .addSelect(
        `CASE
          WHEN booking.status = 'checked_in' THEN 0
          WHEN booking.status = 'confirmed' THEN 1
          WHEN booking.status = 'draft' THEN 2
          ELSE 3
        END`,
        "booking_operation_rank"
      )
      .orderBy("booking_operation_rank", "ASC")
      .addOrderBy("booking.arrival_date", "DESC")
      .addOrderBy("booking.create_time", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const unitRows = bookings.length
      ? await this.dataSource.query(
        `SELECT unit.id,
                unit.unit_code AS "unitCode",
                unit.unit_name AS "unitName"
         FROM biz_unit unit
         WHERE unit.tenant_id = $1
           AND unit.park_id = $2
           AND unit.id = ANY($3::uuid[])`,
        [scope.tenantId, scope.parkId, [...new Set(bookings.map((booking) => booking.unitId))]]
      ) as Array<{ id: string; unitCode: string | null; unitName: string | null }>
      : [];
    const unitDisplay = new Map(unitRows.map((row) => [row.id, row]));
    const canReadFinance = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_READ);
    const items = bookings.map((booking): HomestayBookingListItem => ({
      ...this.projectBooking(booking, canReadFinance),
      unitCode: unitDisplay.get(booking.unitId)?.unitCode ?? null,
      unitName: unitDisplay.get(booking.unitId)?.unitName ?? null
    }));
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async getBooking(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ): Promise<HomestayBookingDetailResponse> {
    return this.getBookingDetail(scope, actor, id);
  }

  async listStays(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayStayQueryDto
  ): Promise<HomestayStayListResponse> {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return { items: [], total: 0, page: query.page, page_size: query.page_size };
    }
    const businessDate = query.business_date
      ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    const builder = this.buildStayListQuery(
      scope,
      allowedUnitIds,
      query,
      businessDate
    );
    const countBuilder = builder.clone();
    const [bookings, total] = await Promise.all([
      builder
        .orderBy("booking.arrival_date", "ASC")
        .addOrderBy("booking.create_time", "ASC")
        .skip((query.page - 1) * query.page_size)
        .take(query.page_size)
        .getMany(),
      countBuilder.getCount()
    ]);
    const enrichment = await this.loadStayListEnrichment(scope, bookings);
    const canReadFinance = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_READ);
    return {
      items: bookings.map((booking) =>
        this.projectStayListItem(booking, enrichment, canReadFinance)),
      total,
      page: query.page,
      page_size: query.page_size
    };
  }

  private buildStayListQuery(
    scope: TenantParkScope,
    allowedUnitIds: string[] | null,
    query: HomestayStayQueryDto,
    businessDate: string
  ): SelectQueryBuilder<HomestayBookingEntity> {
    const builder = this.bookingsRepository.createQueryBuilder("booking")
      .where("booking.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("booking.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("booking.is_deleted = false")
      .andWhere("booking.status IN (:...stayStatuses)", {
        stayStatuses: ["confirmed", "checked_in", "checked_out"]
      });
    if (allowedUnitIds !== null) {
      builder.andWhere("booking.unit_id IN (:...allowedUnitIds)", { allowedUnitIds });
    }
    if (query.queue === "arrivals") {
      builder
        .andWhere("booking.arrival_date = :businessDate", { businessDate })
        .andWhere("booking.status IN (:...arrivalStatuses)", {
          arrivalStatuses: ["confirmed", "checked_in", "checked_out"]
        });
    } else if (query.queue === "departures") {
      builder
        .andWhere("booking.departure_date = :businessDate", { businessDate })
        .andWhere("booking.status IN (:...departureStatuses)", {
          departureStatuses: ["checked_in", "checked_out"]
        });
    } else if (query.queue === "in_house") {
      builder.andWhere("booking.status = 'checked_in'");
    }
    return builder;
  }

  private async loadStayListEnrichment(
    scope: TenantParkScope,
    bookings: HomestayBookingEntity[]
  ) {
    if (bookings.length === 0) {
      return {
        unitDisplay: new Map<string, { unitCode: string | null; unitName: string | null }>(),
        credentialCount: new Map<string, number>()
      };
    }
    const bookingIds = bookings.map((booking) => booking.id);
    const unitIds = [...new Set(bookings.map((booking) => booking.unitId))];
    const [unitRows, credentialRows] = await Promise.all([
      this.dataSource.query(
        `SELECT id, unit_code AS "unitCode", unit_name AS "unitName"
         FROM biz_unit
         WHERE tenant_id = $1 AND park_id = $2 AND id = ANY($3::uuid[])`,
        [scope.tenantId, scope.parkId, unitIds]
      ) as Promise<Array<{ id: string; unitCode: string | null; unitName: string | null }>>,
      this.dataSource.query(
        `SELECT booking_id AS "bookingId", count(*)::int AS "credentialCount"
         FROM biz_homestay_stay_credential
         WHERE tenant_id = $1 AND park_id = $2
           AND booking_id = ANY($3::uuid[]) AND is_deleted = false
         GROUP BY booking_id`,
        [scope.tenantId, scope.parkId, bookingIds]
      ) as Promise<Array<{ bookingId: string; credentialCount: number }>>
    ]);
    return {
      unitDisplay: new Map(unitRows.map((unit) => [unit.id, unit])),
      credentialCount: new Map(
        credentialRows.map((row) => [row.bookingId, Number(row.credentialCount)])
      )
    };
  }

  private projectStayListItem(
    booking: HomestayBookingEntity,
    enrichment: Awaited<ReturnType<HomestayService["loadStayListEnrichment"]>>,
    canReadFinance: boolean
  ): HomestayStayListItem {
    return {
      ...this.projectBooking(booking, canReadFinance),
      unitCode: enrichment.unitDisplay.get(booking.unitId)?.unitCode ?? null,
      unitName: enrichment.unitDisplay.get(booking.unitId)?.unitName ?? null,
      checkedInAt: booking.actualCheckInTime?.toISOString() ?? null,
      checkedOutAt: booking.actualCheckOutTime?.toISOString() ?? null,
      credentialCount: enrichment.credentialCount.get(booking.id) ?? 0
    };
  }

  async getStay(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    stayId: string
  ): Promise<HomestayBookingDetailResponse> {
    return this.getBookingDetail(
      scope,
      actor,
      stayId,
      new Set(["confirmed", "checked_in", "checked_out"])
    );
  }

  private async getBookingDetail(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    allowedStatuses?: ReadonlySet<string>
  ): Promise<HomestayBookingDetailResponse> {
    const booking = await this.mustFindAuthorizedBooking(scope, actor, id);
    if (allowedStatuses && !allowedStatuses.has(booking.status)) {
      throw new NotFoundException("Homestay stay not found");
    }
    const access = this.bookingDetailAccess(actor);
    const relations = await this.loadBookingDetailRelations(scope, id, access);
    return this.projectBookingDetail(booking, relations, access);
  }

  private bookingDetailAccess(actor: JwtPrincipal): BookingDetailAccess {
    const canReadFinance = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_READ);
    const canReadTurnover = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_READ);
    return {
      canReadFinance,
      canReadTurnover,
      canReadTurnoverFiles: canReadTurnover
        && this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ)
    };
  }

  private async loadBookingDetailRelations(
    scope: TenantParkScope,
    bookingId: string,
    access: BookingDetailAccess
  ): Promise<BookingDetailRelations> {
    const [nights, guests, credentials, ledger, actions, turnover] = await Promise.all([
      this.dataSource.getRepository(HomestayBookingNightEntity).find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId, isDeleted: false },
        order: { businessDate: "ASC" }
      }),
      this.dataSource.getRepository(HomestayBookingGuestEntity).find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId, isDeleted: false }
      }),
      this.dataSource.getRepository(HomestayStayCredentialEntity).find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId, isDeleted: false }
      }),
      access.canReadFinance
        ? this.dataSource.getRepository(HomestayLedgerEntryEntity).find({
            where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId, isDeleted: false },
            order: { occurredAt: "ASC" }
          })
        : Promise.resolve([]),
      this.dataSource.getRepository(HomestayBookingActionLogEntity).find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId },
        order: { actionTime: "DESC" }
      }),
      access.canReadTurnover
        ? this.turnoversRepository.findOne({
            where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId, isDeleted: false }
          })
        : Promise.resolve(null)
    ]);
    const guestPartyIds = [...new Set(guests.map((guest) => guest.partyId))];
    const guestPartyRows = guestPartyIds.length
      ? await this.dataSource.query(
        `SELECT party.id, party.display_name AS "displayName"
         FROM biz_party party
         WHERE party.tenant_id = $1
           AND party.park_id = $2
           AND party.id = ANY($3::uuid[])
           AND party.is_deleted = false`,
        [scope.tenantId, scope.parkId, guestPartyIds]
      ) as Array<{ id: string; displayName: string }>
      : [];
    return {
      nights,
      guests,
      credentials,
      ledger,
      actions,
      turnover,
      guestDisplayNames: new Map(guestPartyRows.map((party) => [party.id, party.displayName]))
    };
  }

  private projectBookingDetail(
    booking: HomestayBookingEntity,
    relations: BookingDetailRelations,
    access: BookingDetailAccess
  ): HomestayBookingDetailResponse {
    const {
      nights,
      guests,
      credentials,
      ledger,
      actions,
      turnover,
      guestDisplayNames
    } = relations;
    return {
      booking: this.projectBooking(booking, access.canReadFinance),
      nights: nights.map((night) => ({
        id: night.id,
        businessDate: night.businessDate,
        ...(access.canReadFinance
          ? {
              baseRate: night.baseRate,
              overrideRate: night.overrideRate,
              finalRate: night.finalRate,
              priceSource: night.priceSource
            }
          : {})
      })),
      guests: guests.map((guest) => ({
        id: guest.id,
        partyId: guest.partyId,
        partyDisplayName: guestDisplayNames.get(guest.partyId) ?? "未命名住客",
        isPrimary: guest.isPrimary,
        verificationStatus: guest.verificationStatus
      })),
      credentials: credentials.map((credential) => this.projectCredential(credential)),
      ...(access.canReadFinance
        ? {
            ledger: ledger.map((entry) => ({
              id: entry.id,
              entryType: entry.entryType,
              chargeType: entry.chargeType,
              amount: entry.amount,
              paymentMethod: entry.paymentMethod,
              status: entry.status,
              occurredAt: entry.occurredAt.toISOString(),
              reason: entry.reason
            })),
            ledger_summary: formatHomestayLedgerSummary(ledger)
          }
        : {}),
      finance_visible: access.canReadFinance,
      actions: actions.map((action) => ({
        id: action.id,
        action: action.action,
        beforeStatus: action.beforeStatus,
        afterStatus: action.afterStatus,
        reason: action.reason,
        operatorName: action.operatorName,
        actionTime: action.actionTime.toISOString()
      })),
      turnover: turnover
        ? this.projectTurnover(turnover, access.canReadTurnoverFiles)
        : null
    };
  }

  async createBooking(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreateHomestayBookingDto,
    idempotencyKey?: string
  ) {
    await this.unitAccessService.assertAccess(scope, actor, dto.unit_id);
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.assertUnitBookable(manager, scope, dto.unit_id);
        if (dto.booker_party_id) {
          const booker = await manager.getRepository(PartyEntity).findOne({
            where: {
              id: dto.booker_party_id,
              tenantId: scope.tenantId,
              parkId: scope.parkId,
              partyType: "person",
              isDeleted: false
            }
          });
          if (!booker) throw new NotFoundException("Individual booker party not found");
        }
        const pricing = await this.calculatePricing(manager, scope, dto.unit_id, dto.arrival_date, dto.departure_date);
        const bookingRepository = manager.getRepository(HomestayBookingEntity);
        const booking = await bookingRepository.save(bookingRepository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          bookingCode: dto.booking_code?.trim() || this.generateBookingCode(),
          unitId: dto.unit_id,
          bookerPartyId: dto.booker_party_id ?? null,
          occupancyId: null,
          status: "draft",
          arrivalDate: pricing.arrivalDate,
          departureDate: pricing.departureDate,
          expectedArrivalTime: dto.expected_arrival_time ? new Date(dto.expected_arrival_time) : null,
          sourceType: dto.source_type,
          channelName: dto.channel_name?.trim() ?? null,
          externalOrderNo: dto.external_order_no?.trim() ?? null,
          channelSyncStatus: dto.source_type === "ota_reserved" ? "reserved_not_connected" : "not_applicable",
          guestCount: dto.guest_count,
          currency: pricing.config.currency,
          roomAmount: pricing.total,
          adjustmentAmount: "0.00",
          totalAmount: pricing.total,
          cancellationPolicySnapshot: this.cancellationSnapshot(pricing.config),
          createBy: actor.sub,
          updateBy: actor.sub,
          remark: dto.remark?.trim() ?? null
        }));
        await manager.getRepository(HomestayBookingNightEntity).save(
          pricing.nights.map((night) => manager.getRepository(HomestayBookingNightEntity).create({
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            bookingId: booking.id,
            ...night,
            createBy: actor.sub,
            updateBy: actor.sub
          }))
        );
        const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
        const occupancy = await this.propertyOccupanciesService.createInTransaction(manager, scope, actor, {
          unit_id: booking.unitId,
          source_domain: "homestay",
          source_type: "homestay_booking",
          source_id: booking.id,
          start_at: this.businessDateStart(booking.arrivalDate).toISOString(),
          end_at: this.businessDateStart(booking.departureDate).toISOString(),
          status: "held",
          hold_expires_at: holdExpiresAt.toISOString(),
          remark: `Homestay draft ${booking.bookingCode}`
        }, idempotencyKey);
        booking.occupancyId = occupancy.id;
        await bookingRepository.save(booking);
        await this.log(manager, scope, actor, booking, "create", null, "draft", "人工创建民宿订单", {
          hold_expires_at: holdExpiresAt.toISOString(),
          room_amount: booking.roomAmount
        });
        return booking;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("Booking code or external channel order already exists");
      }
      throw error;
    }
  }

  async confirmBooking(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (booking.status === "confirmed") return booking;
      this.assertStatus(booking, ["draft"], "Only draft bookings can be confirmed");
      await this.assertUnitBookable(manager, scope, booking.unitId);
      if (!booking.occupancyId) throw new ConflictException("Booking occupancy hold is missing");
      await this.propertyOccupanciesService.activateInTransaction(manager, scope, actor, booking.occupancyId);
      const before = booking.status;
      booking.status = "confirmed";
      booking.updateBy = actor.sub;
      const saved = await manager.getRepository(HomestayBookingEntity).save(booking);
      if (toMoneyCents(saved.roomAmount) > 0n) {
        await this.createLedgerEntry(manager, scope, actor, saved.id, {
          entry_type: "charge",
          charge_type: "room",
          amount: saved.roomAmount,
          reason: "订单确认自动生成房费应收"
        });
      }
      await this.log(manager, scope, actor, saved, "confirm", before, saved.status, "确认订单并锁房");
      return saved;
    });
  }

  async markNoShow(scope: TenantParkScope, actor: JwtPrincipal, id: string, reason: string) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (booking.status === "no_show") return booking;
      this.assertStatus(booking, ["confirmed"], "Only confirmed bookings can be marked as no-show");
      assertHomestayNoShowWindow(new Date(), this.businessDateStart(booking.arrivalDate));
      const revokedCredentials = await this.voidIssuedCredentials(manager, scope, actor, id);
      if (booking.occupancyId) {
        await this.propertyOccupanciesService.releaseInTransaction(
          manager,
          scope,
          actor,
          booking.occupancyId,
          reason,
          "cancelled"
        );
      }
      const before = booking.status;
      booking.status = "no_show";
      booking.noShowAt = new Date();
      booking.updateBy = actor.sub;
      const saved = await manager.getRepository(HomestayBookingEntity).save(booking);
      await this.log(manager, scope, actor, saved, "no_show", before, saved.status, reason, {
        revoked_credentials: revokedCredentials
      });
      return saved;
    });
  }

  async cancelBooking(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    reason: string,
    clientKey = ""
  ) {
    if (!this.approvalCommands) {
      assertPropertyHighRiskActionApprovalRequired("homestay.bookings.cancel");
      throw new ConflictException("Property approval runtime is unavailable");
    }
    const approvalCommands = this.approvalCommands;
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (booking.status === "cancelled") return booking;
      this.assertStatus(booking, ["draft", "confirmed"], "Only draft or confirmed bookings can be cancelled");
      const before = booking.status;
      const evaluationRows = await manager.query(
        `SELECT transaction_timestamp()::text AS "cancellationEvaluationAt"`
      ) as Array<{ cancellationEvaluationAt: string }>;
      const cancellationEvaluationAt = evaluationRows[0]?.cancellationEvaluationAt;
      if (!cancellationEvaluationAt) throw new ConflictException("Cancellation evaluation time is unavailable");
      const occupancyRows = booking.occupancyId ? await manager.query(
        `SELECT id::text AS id, version, status FROM biz_property_occupancy
          WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR UPDATE`,
        [scope.tenantId, scope.parkId, booking.occupancyId]
      ) as Array<{ id: string; version: number; status: string }> : [];
      if (booking.occupancyId && occupancyRows.length !== 1) {
        throw new ConflictException("Booking occupancy changed");
      }
      const occupancy = occupancyRows[0] ?? null;
      const credentials = await manager.query(
        `SELECT id::text AS id, version, status FROM biz_homestay_stay_credential
          WHERE tenant_id=$1 AND park_id=$2 AND booking_id=$3
            AND status='issued' AND is_deleted=false ORDER BY id FOR UPDATE`,
        [scope.tenantId, scope.parkId, id]
      ) as Array<{ id: string; version: number; status: string }>;
      const ledgerContributors = await this.lockConfirmedHomestayLedger(
        manager, scope, booking.id
      );
      await this.assertNoUnresolvedLegacyHomestayFinance(manager, scope, booking.id);
      const cancellationFee = before === "confirmed"
        ? this.calculateCancellationFee(booking, cancellationEvaluationAt)
        : "0.00";
      const cancellableRoomCharge = before === "confirmed"
        ? calculateCancellableRoomCharge(ledgerContributors)
        : "0.00";
      const financialTotal = formatMoneyCents(
        toMoneyCents(cancellableRoomCharge) + toMoneyCents(cancellationFee)
      );
      return approvalCommands.createPendingRequest(
        { transactionContext: manager },
        {
          contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
          scope,
          actionId: "homestay.bookings.cancel.request",
          sourceType: "homestay-booking",
          sourceId: booking.id,
          sourceExpectedVersion: booking.version,
          requesterId: actor.sub,
          submitterId: actor.sub,
          actorId: actor.sub,
          clientKey,
          businessIntentKey: `homestay-cancel:${booking.id}:${booking.version}`,
          canonicalPayload: {
            bookingId: booking.id,
            unitId: booking.unitId,
            fromStatus: before,
            reason: reason.trim(),
            actorName: actor.realName?.trim() || actor.username,
            cancellationEvaluationAt,
            occupancy: occupancy ? { id: occupancy.id, expectedVersion: occupancy.version,
              beforeStatus: occupancy.status, afterStatus: "cancelled" } : null,
            credentials: credentials.map((row) => ({ id: row.id, expectedVersion: row.version,
              beforeStatus: row.status, afterStatus: "void" })),
            ledgerContributors: ledgerContributors.map((row) => ({ id: row.id,
              expectedVersion: row.version, status: row.status, entryType: row.entryType,
              chargeType: row.chargeType, amount: row.amount, currency: row.currency,
              sourceLedgerEntryId: row.sourceLedgerEntryId })),
            roomWaiverAmount: cancellableRoomCharge,
            cancellationFeeAmount: cancellationFee,
            currency: financialTotal === "0.00" ? null : booking.currency
          },
          payloadSchemaVersion: 1,
          amount: financialTotal === "0.00" ? null : financialTotal,
          currency: financialTotal === "0.00" ? null : booking.currency
        }
      );
    });
  }

  async executeApprovedCancellation(input: {
    manager: EntityManager;
    requestId: string;
    executionIdempotencyKey: string;
    canonicalPayload: Readonly<Record<string, unknown>>;
    sourceExpectedVersion: number;
    request: { tenantId: string; parkId: string; sourceId: string; requesterId: string };
  }): Promise<void> {
    const payload = input.canonicalPayload;
    const bookingId = this.requiredApprovalUuid(payload.bookingId);
    if (bookingId !== input.request.sourceId) throw new ConflictException("Approval source changed");
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    const bookings = await input.manager.query(
      `SELECT id::text AS id, unit_id::text AS "unitId", occupancy_id::text AS "occupancyId",
              status, currency, version, arrival_date::text AS "arrivalDate",
              room_amount::text AS "roomAmount", cancellation_policy_snapshot AS "cancellationPolicySnapshot"
         FROM biz_homestay_booking
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, bookingId]
    ) as Array<{ id: string; unitId: string; occupancyId: string | null; status: string;
      currency: string; version: number; arrivalDate: string; roomAmount: string;
      cancellationPolicySnapshot: Record<string, unknown> }>;
    const booking = bookings[0];
    if (!booking || booking.version !== input.sourceExpectedVersion
      || booking.status !== payload.fromStatus || booking.unitId !== payload.unitId
      || (booking.occupancyId === null) !== (payload.occupancy === null)) {
      throw new ConflictException("Approval source changed");
    }
    const frozenOccupancy = payload.occupancy as Record<string, unknown> | null;
    const occupancyRows = booking.occupancyId ? await input.manager.query(
      `SELECT id::text AS id, version, status FROM biz_property_occupancy
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, booking.occupancyId]
    ) as Array<{ id: string; version: number; status: string }> : [];
    const occupancy = occupancyRows[0] ?? null;
    const currentOccupancy = occupancy ? { id: occupancy.id, expectedVersion: occupancy.version,
      beforeStatus: occupancy.status, afterStatus: "cancelled" } : null;
    if (propertyApprovalCanonicalHash(currentOccupancy as PropertyApprovalJsonValue)
      !== propertyApprovalCanonicalHash(frozenOccupancy as PropertyApprovalJsonValue)) {
      throw new ConflictException("Approval source changed");
    }
    const currentCredentials = await input.manager.query(
      `SELECT id::text AS id, version, status FROM biz_homestay_stay_credential
        WHERE tenant_id=$1 AND park_id=$2 AND booking_id=$3
          AND status='issued' AND is_deleted=false ORDER BY id FOR UPDATE`,
      [scope.tenantId, scope.parkId, bookingId]
    ) as Array<{ id: string; version: number; status: string }>;
    const credentialSnapshot = currentCredentials.map((row) => ({ id: row.id,
      expectedVersion: row.version, beforeStatus: row.status, afterStatus: "void" }));
    if (propertyApprovalCanonicalHash(credentialSnapshot as unknown as PropertyApprovalJsonValue)
      !== propertyApprovalCanonicalHash(payload.credentials as PropertyApprovalJsonValue)) {
      throw new ConflictException("Approval source changed");
    }
    const currentLedger = await this.lockConfirmedHomestayLedger(input.manager, scope, bookingId);
    await this.assertNoUnresolvedLegacyHomestayFinance(input.manager, scope, bookingId);
    const ledgerSnapshot = currentLedger.map((row) => ({ id: row.id,
      expectedVersion: row.version, status: row.status, entryType: row.entryType,
      chargeType: row.chargeType, amount: row.amount, currency: row.currency,
      sourceLedgerEntryId: row.sourceLedgerEntryId }));
    if (propertyApprovalCanonicalHash(ledgerSnapshot as unknown as PropertyApprovalJsonValue)
      !== propertyApprovalCanonicalHash(payload.ledgerContributors as PropertyApprovalJsonValue)) {
      throw new ConflictException("Approval source changed");
    }
    const cancellationEvaluationAt = String(payload.cancellationEvaluationAt ?? "");
    const roomWaiverAmount = calculateCancellableRoomCharge(currentLedger);
    const cancellationFeeAmount = this.calculateCancellationFee(booking, cancellationEvaluationAt);
    const financialTotal = formatMoneyCents(
      toMoneyCents(roomWaiverAmount) + toMoneyCents(cancellationFeeAmount)
    );
    const currency = financialTotal === "0.00" ? null : booking.currency;
    if (roomWaiverAmount !== payload.roomWaiverAmount
      || cancellationFeeAmount !== payload.cancellationFeeAmount
      || currency !== payload.currency) {
      throw new ConflictException("Approval source changed");
    }
    const manifests = await input.manager.query(
      `SELECT effect_kind AS "effectKind", effect_line_key AS "effectLineKey",
              invariant_hash AS "effectHash", line_amount AS "lineAmount", currency
         FROM biz_property_execution_effect_manifest
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3 ORDER BY effect_ordinal`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as Array<{ effectKind: string; effectLineKey: string; effectHash: string; lineAmount: string | null; currency: string | null }>;
    const byKind = new Map(manifests.map((row) => [row.effectKind, row]));
    const bookingEffect = byKind.get("homestay.booking.cancel");
    if (!bookingEffect) throw new ConflictException("Approval effect manifest missing");
    if ((toMoneyCents(roomWaiverAmount) > 0n) !== byKind.has("homestay.ledger.waiver")
      || (toMoneyCents(cancellationFeeAmount) > 0n) !== byKind.has("homestay.ledger.charge")) {
      throw new ConflictException("Approval effect manifest missing");
    }
    for (const credential of currentCredentials) {
      const rows = typeormQueryRows<{ id: string }>(await input.manager.query(
        `UPDATE biz_homestay_stay_credential
            SET status='void', update_by=$5, update_time=clock_timestamp(), version=version+1
          WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4
            AND status=$6 AND is_deleted=false RETURNING id::text AS id`,
        [scope.tenantId, scope.parkId, credential.id, credential.version,
          input.request.requesterId, credential.status]
      ));
      if (rows.length !== 1) throw new ConflictException("Approval source changed");
    }
    if (occupancy && frozenOccupancy) {
      const released = typeormQueryRows<{ id: string }>(await input.manager.query(
        `UPDATE biz_property_occupancy
            SET status=$8, release_reason=$5, released_at=clock_timestamp(),
                update_by=$6, update_time=clock_timestamp(), version=version+1
          WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4
            AND status=$7 AND is_deleted=false RETURNING id::text AS id`,
        [scope.tenantId, scope.parkId, occupancy.id, occupancy.version,
          String(payload.reason ?? ""), input.request.requesterId, occupancy.status,
          String(frozenOccupancy.afterStatus)]
      ));
      if (released.length !== 1) throw new ConflictException("Approval source changed");
    }
    const cancelled = typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_homestay_booking
          SET status='cancelled', cancel_reason=$5, cancelled_at=clock_timestamp(),
              update_by=$6, update_time=clock_timestamp(), version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4
          AND status=$7 AND is_deleted=false RETURNING version`,
      [scope.tenantId, scope.parkId, bookingId, input.sourceExpectedVersion,
        String(payload.reason ?? ""), input.request.requesterId, booking.status]
    ));
    if (cancelled.length !== 1 || cancelled[0]!.version !== input.sourceExpectedVersion + 1) {
      throw new ConflictException("Approval source changed");
    }
    for (const effectKind of ["homestay.ledger.waiver", "homestay.ledger.charge"] as const) {
      const effect = byKind.get(effectKind);
      if (!effect) continue;
      const entryType = effectKind.endsWith("waiver") ? "waiver" : "charge";
      const chargeType = entryType === "waiver" ? "room_cancellation" : "cancellation_fee";
      const expectedAmount = entryType === "waiver" ? roomWaiverAmount : cancellationFeeAmount;
      if (effect.lineAmount !== expectedAmount || effect.currency !== currency) {
        throw new ConflictException("Approval effect manifest missing");
      }
      const ledger = await input.manager.query(
        `INSERT INTO biz_homestay_ledger_entry(
           tenant_id,park_id,booking_id,entry_type,charge_type,amount,currency,status,reason,
           occurred_at,create_by,update_by,approval_execution_key,approval_effect_kind,
           approval_effect_line_key,approval_effect_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,'confirmed',$8,clock_timestamp(),$9,$9,$10,$11,$12,$13)
         RETURNING id::text AS id`,
        [scope.tenantId, scope.parkId, bookingId, entryType, chargeType, effect.lineAmount,
          effect.currency, entryType === "waiver"
            ? "Cancellation reverses the confirmed room charge" : "按审批提交时冻结的取消规则计算",
          input.request.requesterId, input.executionIdempotencyKey, effect.effectKind,
          effect.effectLineKey, effect.effectHash]
      ) as Array<{ id: string }>;
      if (ledger.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
    }
    const actionRows = await input.manager.query(
      `INSERT INTO biz_homestay_booking_action_log(
         tenant_id,park_id,booking_id,action,before_status,after_status,reason,snapshot,
         operator_id,operator_name,action_time,create_time,approval_execution_key,
         approval_effect_kind,approval_effect_line_key,approval_effect_hash)
       VALUES($1,$2,$3,'cancel',$4,'cancelled',$5,$6::jsonb,$7,$8,clock_timestamp(),
              clock_timestamp(),$9,$10,$11,$12) RETURNING id::text AS id`,
      [scope.tenantId, scope.parkId, bookingId, booking.status, String(payload.reason ?? ""),
        JSON.stringify({ cancellation_evaluation_at: cancellationEvaluationAt,
          cancellation_fee: cancellationFeeAmount, room_waiver_amount: roomWaiverAmount,
          compound_contributors: { occupancy: currentOccupancy, credentials: credentialSnapshot,
            ledger: ledgerSnapshot },
          compound_contributor_hash: propertyApprovalCanonicalHash({ occupancy: currentOccupancy,
            credentials: credentialSnapshot, ledger: ledgerSnapshot }) }),
        input.request.requesterId, String(payload.actorName ?? "审批申请人"),
        input.executionIdempotencyKey, bookingEffect.effectKind, bookingEffect.effectLineKey,
        bookingEffect.effectHash]
    ) as Array<{ id: string }>;
    if (actionRows.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
  }

  private async lockConfirmedHomestayLedger(
    manager: EntityManager,
    scope: TenantParkScope,
    bookingId: string
  ): Promise<HomestayLedgerSnapshotRow[]> {
    return manager.query(
      `SELECT id::text AS id, version, entry_type AS "entryType", charge_type AS "chargeType",
              amount::text AS amount, currency, status,
              source_ledger_entry_id::text AS "sourceLedgerEntryId",
              create_by::text AS "recordedBy"
         FROM biz_homestay_ledger_entry
        WHERE tenant_id=$1 AND park_id=$2 AND booking_id=$3
          AND status='confirmed' AND is_deleted=false
        ORDER BY id FOR UPDATE`,
      [scope.tenantId, scope.parkId, bookingId]
    ) as Promise<HomestayLedgerSnapshotRow[]>;
  }

  private async assertNoUnresolvedLegacyHomestayFinance(
    manager: EntityManager,
    scope: TenantParkScope,
    bookingId: string
  ): Promise<void> {
    const unresolved = await manager.query(
      `SELECT result.id::text AS id FROM biz_homestay_ledger_entry result
        WHERE result.tenant_id=$1 AND result.park_id=$2 AND result.booking_id=$3
          AND result.entry_type IN ('refund','waiver')
          AND result.source_ledger_entry_id IS NULL AND result.is_deleted=false
          AND NOT EXISTS (
            SELECT 1 FROM biz_homestay_legacy_finance_source_map legacy
             WHERE legacy.tenant_id=result.tenant_id AND legacy.park_id=result.park_id
               AND legacy.result_ledger_entry_id=result.id)
        ORDER BY result.id FOR UPDATE`,
      [scope.tenantId, scope.parkId, bookingId]
    ) as Array<{ id: string }>;
    if (unresolved.length > 0) {
      throw new ConflictException("Legacy refund or waiver source must be reconciled before approval");
    }
  }

  private async lockHomestayFinanceSourceKey(
    manager: EntityManager,
    scope: TenantParkScope,
    bookingId: string,
    sourceLedgerEntryId: string
  ): Promise<void> {
    const canonicalKey = ["homestay-finance-source", scope.tenantId, scope.parkId,
      bookingId, sourceLedgerEntryId].join("|");
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
      [canonicalKey]
    );
  }

  private async lockHomestayFinanceSource(
    manager: EntityManager,
    scope: TenantParkScope,
    bookingId: string,
    sourceLedgerEntryId: string
  ): Promise<HomestayLedgerSnapshotRow> {
    const rows = await manager.query(
      `SELECT id::text AS id,version,entry_type AS "entryType",charge_type AS "chargeType",
              amount::text AS amount,currency,status,
              source_ledger_entry_id::text AS "sourceLedgerEntryId",
              create_by::text AS "recordedBy"
         FROM biz_homestay_ledger_entry
        WHERE tenant_id=$1 AND park_id=$2 AND booking_id=$3 AND id=$4
          AND status='confirmed' AND is_deleted=false
        FOR UPDATE`,
      [scope.tenantId, scope.parkId, bookingId, sourceLedgerEntryId]
    ) as HomestayLedgerSnapshotRow[];
    if (rows.length !== 1) throw new ConflictException("Finance allocation source changed");
    return rows[0]!;
  }

  private async homestayFinanceAllocationSnapshot(
    manager: EntityManager,
    scope: TenantParkScope,
    source: HomestayLedgerSnapshotRow,
    lockedLedger: HomestayLedgerSnapshotRow[],
    entryType: "refund" | "waiver"
  ): Promise<{ allocatedCents: bigint;
    contributors: Array<Record<string, PropertyApprovalJsonValue>> }> {
    const mapped = await manager.query(
      `SELECT result_ledger_entry_id::text AS "resultId",
              source_expected_version AS "sourceExpectedVersion",currency
         FROM biz_homestay_legacy_finance_source_map
        WHERE tenant_id=$1 AND park_id=$2 AND source_ledger_entry_id=$3
        ORDER BY result_ledger_entry_id FOR SHARE`,
      [scope.tenantId, scope.parkId, source.id]
    ) as HomestayLegacyFinanceMappingRow[];
    if (mapped.some((row) => row.sourceExpectedVersion !== source.version
      || row.currency !== source.currency)) {
      throw new ConflictException("Finance allocation source changed");
    }
    const mappedIds = new Set(mapped.map((row) => row.resultId));
    const contributors = lockedLedger.flatMap((row) => {
      const direct = row.sourceLedgerEntryId === source.id;
      const legacyMapped = mappedIds.has(row.id);
      if (!direct && !legacyMapped) return [];
      if (direct && legacyMapped) throw new ConflictException("Finance allocation is ambiguous");
      if (row.entryType !== entryType || row.currency !== source.currency) {
        throw new ConflictException("Finance allocation source changed");
      }
      return [{ id: row.id, expectedVersion: row.version, status: row.status,
        entryType: row.entryType, amount: row.amount, currency: row.currency,
        allocationKind: direct ? "direct" : "legacy-mapped" }];
    }).sort((left, right) => String(left.id).localeCompare(String(right.id)));
    return {
      allocatedCents: contributors.reduce(
        (sum, row) => sum + toMoneyCents(String(row.amount)), 0n
      ),
      contributors
    };
  }

  private requiredApprovalUuid(value: unknown): string {
    if (typeof value !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new ConflictException("Approval payload is invalid");
    }
    return value;
  }

  async rescheduleBooking(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: RescheduleHomestayBookingDto
  ) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      this.assertStatus(booking, ["draft", "confirmed"], "Only draft or confirmed bookings can be rescheduled");
      const beforeSnapshot = {
        arrival_date: booking.arrivalDate,
        departure_date: booking.departureDate,
        room_amount: booking.roomAmount,
        occupancy_id: booking.occupancyId
      };
      const pricing = await this.calculatePricing(manager, scope, booking.unitId, dto.arrival_date, dto.departure_date);
      if (!booking.occupancyId) throw new ConflictException("Booking occupancy is missing");
      const occupancy = await this.propertyOccupanciesService.replacePeriodInTransaction(
        manager,
        scope,
        actor,
        booking.occupancyId,
        {
          sourceDomain: "homestay",
          sourceType: "homestay_booking",
          sourceId: booking.id,
          startAt: this.businessDateStart(booking.arrivalDate).toISOString(),
          endAt: this.businessDateStart(booking.departureDate).toISOString(),
          status: booking.status === "confirmed" ? "active" : "held"
        },
        this.businessDateStart(pricing.arrivalDate).toISOString(),
        this.businessDateStart(pricing.departureDate).toISOString(),
        booking.status === "draft" ? new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString() : undefined
      );
      await manager.getRepository(HomestayBookingNightEntity).update(
        { tenantId: scope.tenantId, parkId: scope.parkId, bookingId: booking.id, isDeleted: false },
        { isDeleted: true, updateBy: actor.sub }
      );
      await manager.getRepository(HomestayBookingNightEntity).save(
        pricing.nights.map((night) => manager.getRepository(HomestayBookingNightEntity).create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          bookingId: booking.id,
          ...night,
          createBy: actor.sub,
          updateBy: actor.sub
        }))
      );
      const previousAmount = booking.roomAmount;
      const difference = homestayMoneyDifference(pricing.total, previousAmount);
      const differenceCents = toMoneyCents(difference);
      booking.arrivalDate = pricing.arrivalDate;
      booking.departureDate = pricing.departureDate;
      booking.occupancyId = occupancy.id;
      booking.roomAmount = pricing.total;
      booking.adjustmentAmount = difference;
      booking.totalAmount = pricing.total;
      booking.updateBy = actor.sub;
      const saved = await manager.getRepository(HomestayBookingEntity).save(booking);
      if (booking.status === "confirmed" && differenceCents !== 0n) {
        await this.createLedgerEntry(manager, scope, actor, saved.id, {
          entry_type: differenceCents > 0n ? "charge" : "waiver",
          charge_type: differenceCents > 0n ? "reschedule_increase" : "reschedule_decrease",
          amount: formatMoneyCents(differenceCents < 0n ? -differenceCents : differenceCents),
          reason: `订单改期差价：${dto.reason}`
        });
      }
      await this.log(manager, scope, actor, saved, "reschedule", saved.status, saved.status, dto.reason, {
        before: beforeSnapshot,
        after: {
          arrival_date: saved.arrivalDate,
          departure_date: saved.departureDate,
          room_amount: saved.roomAmount,
          occupancy_id: saved.occupancyId
        },
        difference: saved.adjustmentAmount
      });
      return saved;
    });
  }

  async addGuest(scope: TenantParkScope, actor: JwtPrincipal, bookingId: string, dto: AddHomestayGuestDto) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.lockBooking(manager, scope, bookingId);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      assertHomestayGuestRegistrationOpen(booking.status);
      const party = await manager.getRepository(PartyEntity)
        .createQueryBuilder("party")
        .addSelect("party.identityNumberHash")
        .where("party.id = :partyId", { partyId: dto.party_id })
        .andWhere("party.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("party.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("party.is_deleted = false")
        .setLock("pessimistic_read")
        .getOne();
      if (!party || party.partyType !== "person") throw new NotFoundException("Guest party not found");
      assertHomestayGuestIdentityVerified(dto.verification_status, party);
      const repository = manager.getRepository(HomestayBookingGuestEntity);
      let entity = await repository.findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId, partyId: dto.party_id, isDeleted: false }
      });
      if (!entity) {
        entity = repository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          bookingId,
          partyId: dto.party_id,
          createBy: actor.sub
        });
      }
      const existingPrimary = await repository.findOne({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          bookingId,
          isPrimary: true,
          isDeleted: false
        }
      });
      entity.isPrimary = entity.isPrimary || (dto.is_primary && !existingPrimary);
      entity.verificationStatus = dto.verification_status;
      entity.verifiedBy = dto.verification_status === "verified" ? actor.sub : null;
      entity.verifiedAt = dto.verification_status === "verified" ? new Date() : null;
      entity.updateBy = actor.sub;
      return repository.save(entity);
    });
  }

  async issueCredential(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    dto: IssueHomestayCredentialDto
  ) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.lockBooking(manager, scope, bookingId);
      this.assertStatus(booking, ["confirmed", "checked_in"], "Credentials require a confirmed or checked-in booking");
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      const repository = manager.getRepository(HomestayStayCredentialEntity);
      const saved = await repository.save(repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        bookingId,
        credentialType: dto.credential_type,
        credentialLabel: dto.credential_label.trim(),
        credentialReference: dto.credential_reference?.trim() ?? null,
        lockDeviceId: dto.lock_device_id?.trim() ?? null,
        temporaryCodeTaskStatus: dto.lock_device_id ? "reserved_not_connected" : "not_applicable",
        status: "issued",
        issuedAt: new Date(),
        returnedAt: null,
        createBy: actor.sub,
        updateBy: actor.sub
      }));
      return this.projectCredential(saved);
    });
  }

  async returnCredential(scope: TenantParkScope, actor: JwtPrincipal, bookingId: string, credentialId: string) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.lockBooking(manager, scope, bookingId);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      const repository = manager.getRepository(HomestayStayCredentialEntity);
      const credential = await repository.findOne({
        where: { id: credentialId, bookingId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!credential) throw new NotFoundException("Stay credential not found");
      if (credential.status === "returned") return this.projectCredential(credential);
      if (credential.status !== "issued") {
        throw new ConflictException("Only issued credentials can be returned");
      }
      credential.status = "returned";
      credential.returnedAt = new Date();
      credential.updateBy = actor.sub;
      return this.projectCredential(await repository.save(credential));
    });
  }

  async checkIn(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (booking.status === "checked_in") return booking;
      this.assertStatus(booking, ["confirmed"], "Only confirmed bookings can check in");
      await this.assertUnitBookable(manager, scope, booking.unitId);
      await this.assertActiveBookingOccupancy(manager, scope, booking);
      const now = new Date();
      assertHomestayCheckInWindow(
        now,
        this.businessDateStart(booking.arrivalDate),
        this.businessDateStart(booking.departureDate)
      );
      const guestRows = await manager.query(
        `SELECT guest.party_id::text AS "partyId" FROM rel_homestay_booking_guest guest
          JOIN biz_party party ON party.tenant_id=guest.tenant_id AND party.park_id=guest.park_id
            AND party.id=guest.party_id AND party.party_type='person' AND party.is_deleted=false
         WHERE guest.tenant_id=$1 AND guest.park_id=$2 AND guest.booking_id=$3
          AND guest.is_deleted=false ORDER BY guest.party_id FOR UPDATE OF guest,party`,
        [scope.tenantId, scope.parkId, id]
      ) as Array<{ partyId: string }>;
      assertHomestayGuestRosterComplete(booking.guestCount, guestRows.length);
      if (!this.identityVerifier) {
        throw new ConflictException("Property identity runtime is unavailable");
      }
      const identityEvidence = await (this.identityVerifier as IdentityVerificationPort).verifyForCheckIn({
        manager: { transactionContext: manager }, scope, bookingId: booking.id,
        partyIds: guestRows.map((row) => row.partyId), expectedConsent: "granted"
      });
      assertHomestayGuestRosterComplete(booking.guestCount, identityEvidence.length);
      const pendingTurnovers = await manager.getRepository(HomestayTurnoverTaskEntity).createQueryBuilder("task")
        .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("task.unit_id = :unitId", { unitId: booking.unitId })
        .andWhere("task.status <> 'completed'")
        .andWhere("task.is_deleted = false")
        .getCount();
      if (pendingTurnovers > 0) throw new ConflictException("Unit turnover must be completed before check-in");
      const issuedCredentials = await manager.getRepository(HomestayStayCredentialEntity).count({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId: id, status: "issued", isDeleted: false }
      });
      if (issuedCredentials < 1) throw new ConflictException("At least one issued key, card, or voucher is required");
      const before = booking.status;
      booking.status = "checked_in";
      booking.actualCheckInTime = now;
      booking.updateBy = actor.sub;
      const saved = await manager.getRepository(HomestayBookingEntity).save(booking);
      await this.log(manager, scope, actor, saved, "check_in", before, saved.status, "办理入住", {
        identity_evidence: identityEvidence
      });
      return saved;
    });
  }

  async checkOut(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (booking.status === "checked_out") return booking;
      this.assertStatus(booking, ["checked_in"], "Only checked-in bookings can check out");
      const issuedCredentials = await manager.getRepository(HomestayStayCredentialEntity).count({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId: id, status: "issued", isDeleted: false }
      });
      if (issuedCredentials > 0) throw new ConflictException("All issued credentials must be returned before checkout");
      const now = new Date();
      if (booking.occupancyId) {
        await this.propertyOccupanciesService.releaseInTransaction(
          manager,
          scope,
          actor,
          booking.occupancyId,
          "guest_checked_out",
          "completed"
        );
      }
      const future = await manager.getRepository(PropertyOccupancyEntity).createQueryBuilder("occupancy")
        .where("occupancy.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("occupancy.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("occupancy.unit_id = :unitId", { unitId: booking.unitId })
        .andWhere("occupancy.is_deleted = false")
        .andWhere("(occupancy.status = 'active' OR (occupancy.status = 'held' AND (occupancy.hold_expires_at IS NULL OR occupancy.hold_expires_at > :now)))")
        .andWhere("occupancy.end_at > :now", { now: now.toISOString() })
        .orderBy("occupancy.start_at", "ASC")
        .getOne();
      const lockEnd = turnoverLockEnd(now, future?.startAt ?? null);
      const turnoverRepository = manager.getRepository(HomestayTurnoverTaskEntity);
      const task = await turnoverRepository.save(turnoverRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        bookingId: booking.id,
        unitId: booking.unitId,
        occupancyId: null,
        status: "pending",
        photoFileIds: [],
        consumables: [],
        createBy: actor.sub,
        updateBy: actor.sub
      }));
      if (lockEnd) {
        const turnoverOccupancy = await this.propertyOccupanciesService.createInTransaction(manager, scope, actor, {
          unit_id: booking.unitId,
          source_domain: "operations",
          source_type: "homestay_turnover",
          source_id: task.id,
          start_at: now.toISOString(),
          end_at: lockEnd.toISOString(),
          status: "active",
          remark: `Turnover after ${booking.bookingCode}`
        }, undefined, {
          sourceType: "homestay_turnover",
          sourceId: task.id
        });
        task.occupancyId = turnoverOccupancy.id;
      }
      await turnoverRepository.save(task);
      const before = booking.status;
      booking.status = "checked_out";
      booking.actualCheckOutTime = now;
      booking.updateBy = actor.sub;
      const saved = await manager.getRepository(HomestayBookingEntity).save(booking);
      await this.log(manager, scope, actor, saved, "check_out", before, saved.status, "退房并生成保洁任务", {
        turnover_task_id: task.id
      });
      return { booking: saved, turnover: task };
    });
  }

  async registerLedgerEntry(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    dto: RegisterHomestayLedgerEntryDto,
    clientKey = ""
  ) {
    if (dto.entry_type === "refund" || dto.entry_type === "waiver") {
      assertPropertyHighRiskActionPermissions(actor, [
        SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_WAIVE,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]);
      if (!this.approvalCommands) {
        assertPropertyHighRiskActionApprovalRequired("homestay.finance.refund-or-waive");
        throw new ConflictException("Property approval runtime is unavailable");
      }
    }
    const requiredPermission = dto.entry_type === "waiver"
      ? SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_WAIVE
      : SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_REGISTER;
    if (!this.hasPermission(actor, requiredPermission)) {
      throw new ForbiddenException(`${requiredPermission} permission is required`);
    }
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.lockBooking(manager, scope, bookingId);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (dto.entry_type === "refund" || dto.entry_type === "waiver") {
        if (!dto.source_ledger_entry_id) {
          throw new BadRequestException("source_ledger_entry_id is required for refund or waiver");
        }
        await this.lockHomestayFinanceSourceKey(
          manager, scope, bookingId, dto.source_ledger_entry_id
        );
        const lockedSource = await this.lockHomestayFinanceSource(
          manager, scope, bookingId, dto.source_ledger_entry_id
        );
        const ledger = await this.lockConfirmedHomestayLedger(manager, scope, bookingId);
        await this.assertNoUnresolvedLegacyHomestayFinance(manager, scope, bookingId);
        assertHomestayManualLedgerMutation(
          dto.entry_type, dto.amount, summarizeHomestayLedger(ledger)
        );
        const source = ledger.find((row) => row.id === dto.source_ledger_entry_id);
        const expectedSourceType = dto.entry_type === "refund" ? "payment" : "charge";
        if (!source || source.id !== lockedSource.id || source.version !== lockedSource.version
          || source.currency !== lockedSource.currency || source.entryType !== expectedSourceType) {
          throw new ConflictException(`${dto.entry_type} must reference a confirmed ${expectedSourceType} entry`);
        }
        const allocation = await this.homestayFinanceAllocationSnapshot(
          manager, scope, source, ledger, dto.entry_type
        );
        const remaining = toMoneyCents(source.amount) - allocation.allocatedCents;
        if (remaining < 0n || toMoneyCents(dto.amount) > remaining) {
          throw new ConflictException("Refund or waiver amount exceeds its source entry");
        }
        const amount = formatHomestayMoney(dto.amount);
        return this.approvalCommands!.createPendingRequest(
          { transactionContext: manager },
          { contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION, scope,
            actionId: "homestay.finance.refund-or-waive.request",
            sourceType: "homestay-booking", sourceId: booking.id,
            sourceExpectedVersion: booking.version, requesterId: actor.sub,
            submitterId: actor.sub, actorId: actor.sub, clientKey,
            businessIntentKey: `homestay-finance:${booking.id}:${booking.version}:${dto.entry_type}:${source.id}:${source.version}`,
            canonicalPayload: { bookingId: booking.id, bookingExpectedVersion: booking.version,
              reason: dto.reason.trim(), actorName: actor.realName?.trim() || actor.username,
              lines: [{ entryType: dto.entry_type, sourceLedgerEntryId: source.id,
                sourceExpectedVersion: source.version, sourceEntryType: source.entryType,
                sourceAmount: source.amount, chargeType: dto.charge_type.trim(), amount,
                currency: source.currency, paymentRecorderId: source.recordedBy,
                allocatedAmount: formatMoneyCents(allocation.allocatedCents),
                remainingAvailableBalance: formatMoneyCents(remaining),
                allocationContributors: allocation.contributors }] },
            payloadSchemaVersion: 1, amount, currency: source.currency }
        );
      }
      const ledger = await manager.getRepository(HomestayLedgerEntryEntity).find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId,
          status: "confirmed", isDeleted: false }
      });
      assertHomestayManualLedgerMutation(dto.entry_type, dto.amount, summarizeHomestayLedger(ledger));
      return this.createLedgerEntry(manager, scope, actor, bookingId, dto);
    });
  }

  async executeApprovedFinance(input: {
    manager: EntityManager; requestId: string; executionIdempotencyKey: string;
    canonicalPayload: Readonly<Record<string, unknown>>; sourceExpectedVersion: number;
    request: { tenantId: string; parkId: string; sourceId: string; requesterId: string };
  }): Promise<void> {
    const payload = input.canonicalPayload;
    if (!Array.isArray(payload.lines) || payload.lines.length !== 1) {
      throw new ConflictException("Approval source changed");
    }
    const line = payload.lines[0] as Record<string, unknown>;
    const bookingId = this.requiredApprovalUuid(payload.bookingId);
    const sourceId = this.requiredApprovalUuid(line.sourceLedgerEntryId);
    if (bookingId !== input.request.sourceId) throw new ConflictException("Approval source changed");
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    const bookings = await input.manager.query(
      `SELECT version,currency FROM biz_homestay_booking WHERE tenant_id=$1 AND park_id=$2
        AND id=$3 AND is_deleted=false FOR UPDATE`, [scope.tenantId, scope.parkId, bookingId]
    ) as Array<{ version: number; currency: string }>;
    await this.lockHomestayFinanceSourceKey(input.manager, scope, bookingId, sourceId);
    const lockedSource = await this.lockHomestayFinanceSource(
      input.manager, scope, bookingId, sourceId
    );
    const currentLedger = await this.lockConfirmedHomestayLedger(input.manager, scope, bookingId);
    const booking = bookings[0];
    const source = currentLedger.find((row) => row.id === sourceId);
    if (!booking || booking.version !== input.sourceExpectedVersion || !source
      || source.id !== lockedSource.id || source.version !== lockedSource.version
      || source.currency !== lockedSource.currency
      || source.version !== Number(line.sourceExpectedVersion)
      || source.entryType !== line.sourceEntryType || source.amount !== line.sourceAmount
      || source.currency !== line.currency || booking.currency !== line.currency) {
      throw new ConflictException("Approval source changed");
    }
    await this.assertNoUnresolvedLegacyHomestayFinance(input.manager, scope, bookingId);
    assertHomestayManualLedgerMutation(
      String(line.entryType) as "refund" | "waiver",
      String(line.amount),
      summarizeHomestayLedger(currentLedger)
    );
    const allocation = await this.homestayFinanceAllocationSnapshot(
      input.manager, scope, source, currentLedger, String(line.entryType) as "refund" | "waiver"
    );
    const remaining = toMoneyCents(source.amount) - allocation.allocatedCents;
    if (remaining < 0n
      || formatMoneyCents(allocation.allocatedCents) !== line.allocatedAmount
      || formatMoneyCents(remaining) !== line.remainingAvailableBalance
      || propertyApprovalCanonicalHash(allocation.contributors as unknown as PropertyApprovalJsonValue)
        !== propertyApprovalCanonicalHash(line.allocationContributors as PropertyApprovalJsonValue)
      || toMoneyCents(String(line.amount)) > remaining) {
      throw new ConflictException("Refund or waiver amount exceeds its source entry");
    }
    const manifests = await input.manager.query(
      `SELECT effect_kind AS "effectKind",effect_line_key AS "effectLineKey",
              invariant_hash AS "effectHash",line_amount::text AS "lineAmount",currency
         FROM biz_property_execution_effect_manifest WHERE tenant_id=$1 AND park_id=$2
          AND request_id=$3`, [scope.tenantId, scope.parkId, input.requestId]
    ) as Array<{ effectKind: string; effectLineKey: string; effectHash: string;
      lineAmount: string; currency: string }>;
    const effect = manifests[0];
    const entryType = String(line.entryType);
    if (!effect || effect.effectKind !== `homestay.ledger.${entryType}`
      || effect.lineAmount !== line.amount || effect.currency !== line.currency) {
      throw new ConflictException("Approval effect manifest missing");
    }
    const inserted = await input.manager.query(
      `INSERT INTO biz_homestay_ledger_entry(
         tenant_id,park_id,booking_id,entry_type,charge_type,amount,currency,source_ledger_entry_id,
         status,reason,occurred_at,create_by,update_by,approval_execution_key,
         approval_effect_kind,approval_effect_line_key,approval_effect_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,clock_timestamp(),$10,$10,$11,$12,$13,$14)
       RETURNING id::text AS id`, [scope.tenantId, scope.parkId, bookingId, entryType,
        String(line.chargeType), effect.lineAmount, effect.currency, sourceId,
        String(payload.reason ?? ""), input.request.requesterId, input.executionIdempotencyKey,
        effect.effectKind, effect.effectLineKey, effect.effectHash]
    ) as Array<{ id: string }>;
    if (inserted.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
  }

  async listTurnovers(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayTurnoverQueryDto
  ): Promise<HomestayTurnoverListResponse> {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return { items: [], total: 0, page: query.page, page_size: query.page_size };
    }
    const builder = this.turnoversRepository.createQueryBuilder("task")
      .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.is_deleted = false");
    if (allowedUnitIds !== null) builder.andWhere("task.unit_id IN (:...allowedUnitIds)", { allowedUnitIds });
    if (query.status === "open") {
      builder.andWhere("task.status IN (:...statuses)", {
        statuses: ["pending", "cleaning", "inspection", "exception"]
      });
    } else {
      builder.andWhere("task.status = :status", { status: query.status });
    }
    const [tasks, total] = await builder.orderBy("task.create_time", "ASC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const unitRows = tasks.length
      ? await this.dataSource.query(
        `SELECT id, unit_code AS "unitCode", unit_name AS "unitName"
         FROM biz_unit
         WHERE tenant_id = $1
           AND park_id = $2
           AND id = ANY($3::uuid[])`,
        [scope.tenantId, scope.parkId, tasks.map((task) => task.unitId)]
      ) as Array<{ id: string; unitCode: string | null; unitName: string | null }>
      : [];
    const unitDisplay = new Map(unitRows.map((unit) => [unit.id, unit]));
    const canReadFiles = this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ);
    const items = tasks.map((task): HomestayTurnoverListItem => ({
      ...this.projectTurnover(task, canReadFiles),
      unitCode: unitDisplay.get(task.unitId)?.unitCode ?? null,
      unitName: unitDisplay.get(task.unitId)?.unitName ?? null,
      createTime: task.createTime.toISOString()
    }));
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async getTurnover(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ): Promise<HomestayTurnoverDetailResponse> {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      throw new NotFoundException("Turnover task not found");
    }
    const builder = this.turnoversRepository.createQueryBuilder("task")
      .where("task.id = :id", { id })
      .andWhere("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.is_deleted = false");
    if (allowedUnitIds !== null) {
      builder.andWhere("task.unit_id IN (:...allowedUnitIds)", { allowedUnitIds });
    }
    const task = await builder.getOne();
    if (!task) throw new NotFoundException("Turnover task not found");
    const canReadFiles = this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ);
    const [unitRows, files, linkedWorkOrder] = await Promise.all([
      this.dataSource.query(
        `SELECT unit_code AS "unitCode", unit_name AS "unitName"
         FROM biz_unit
         WHERE tenant_id = $1
           AND park_id = $2
           AND id = $3
           AND is_deleted = false
         LIMIT 1`,
        [scope.tenantId, scope.parkId, task.unitId]
      ) as Promise<Array<{ unitCode: string | null; unitName: string | null }>>,
      canReadFiles && task.photoFileIds.length > 0
        ? this.filesRepository.createQueryBuilder("file")
            .select([
              "file.id",
              "file.originalName",
              "file.mimeType",
              "file.fileSize"
            ])
            .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
            .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
            .andWhere("file.biz_type = 'homestay_turnover'")
            .andWhere("file.biz_id = :taskId", { taskId: task.id })
            .andWhere("file.id IN (:...photoFileIds)", { photoFileIds: task.photoFileIds })
            .andWhere("file.status = 1")
            .andWhere("file.is_deleted = false")
            .orderBy("file.create_time", "ASC")
            .getMany()
        : Promise.resolve([]),
      task.linkedWorkOrderId && this.workbenchQuery
        ? this.workbenchQuery.getAuthorizedWorkOrderReference(
            scope,
            actor,
            task.linkedWorkOrderId
          )
        : Promise.resolve(undefined)
    ]);
    const unit = unitRows[0];
    return {
      ...this.projectTurnover(task, canReadFiles),
      unitCode: unit?.unitCode ?? null,
      unitName: unit?.unitName ?? null,
      createTime: task.createTime.toISOString(),
      ...(canReadFiles
        ? {
            evidence: files.map((file): PropertyWorkbenchFileRef => ({
              id: file.id,
              originalName: file.originalName,
              mimeType: file.mimeType,
              fileSize: file.fileSize
            }))
          }
        : {}),
      ...(linkedWorkOrder ? { linkedWorkOrder } : {})
    };
  }

  async executeTurnover(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    action: "start" | "complete" | "inspect" | "exception",
    dto: ExecuteHomestayTurnoverDto
  ) {
    if (!["start", "complete", "inspect", "exception"].includes(action)) {
      throw new BadRequestException("Unsupported turnover action");
    }
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(HomestayTurnoverTaskEntity);
      const task = await repository.findOne({
        where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!task) throw new NotFoundException("Turnover task not found");
      await this.unitAccessService.assertAccess(scope, actor, task.unitId);
      if (action === "start") {
        if (task.status !== "pending") throw new ConflictException("Only pending turnover can start");
        task.status = "cleaning";
        task.startedAt = new Date();
      } else if (action === "exception") {
        if (!["pending", "cleaning", "inspection", "exception"].includes(task.status)) {
          throw new ConflictException("Completed turnover cannot be marked as exception");
        }
        if (!dto.exception_description?.trim()) throw new BadRequestException("Exception description is required");
        task.status = "exception";
        task.exceptionDescription = dto.exception_description.trim();
      } else {
        const config = await manager.getRepository(HomestayRateConfigEntity).findOne({
          where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId: task.unitId, isDeleted: false }
        });
        if (action === "complete") {
          if (!["cleaning", "exception"].includes(task.status)) {
            throw new ConflictException("Only cleaning or exception turnover can be completed");
          }
          task.completedAt = new Date();
          task.status = config?.checkoutRequiresInspection ? "inspection" : "completed";
        } else {
          if (task.status !== "inspection") throw new ConflictException("Only inspection turnover can be inspected");
          task.inspectedAt = new Date();
          task.status = "completed";
        }
        if (task.status === "completed" && task.occupancyId) {
          await this.propertyOccupanciesService.releaseInTransaction(
            manager,
            scope,
            actor,
            task.occupancyId,
            "turnover_completed",
            "completed"
          );
        }
      }
      if (dto.assignee_id) task.assigneeId = dto.assignee_id;
      if (dto.assignee_name?.trim()) task.assigneeName = dto.assignee_name.trim();
      if (dto.photo_file_ids) {
        task.photoFileIds = await this.resolveTurnoverPhotoFileIds(manager, scope, task.id, dto.photo_file_ids);
      }
      if (dto.consumables) task.consumables = dto.consumables;
      if (dto.linked_work_order_id) {
        const workOrder = await this.workOrdersRepository.findOne({
          where: {
            id: dto.linked_work_order_id,
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            isDeleted: false
          }
        });
        if (!workOrder || workOrder.unitId !== task.unitId) {
          throw new BadRequestException("linked_work_order_id must reference a work order for this unit");
        }
        task.linkedWorkOrderId = workOrder.id;
      }
      task.updateBy = actor.sub;
      return repository.save(task);
    });
  }

  async dashboard(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    businessDate?: string
  ): Promise<HomestayDashboardResponse> {
    return this.mustDashboardAvailabilityQuery().dashboard(scope, actor, businessDate);
  }

  async availability(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayAvailabilityQueryDto
  ): Promise<HomestayAvailabilityResponse | HomestayAvailabilityListResponse> {
    return this.mustDashboardAvailabilityQuery().availability(scope, actor, query);
  }

  private mustDashboardAvailabilityQuery(): HomestayDashboardAvailabilityQueryService {
    if (!this.dashboardAvailabilityQuery) {
      throw new Error("Homestay dashboard and availability query service is unavailable");
    }
    return this.dashboardAvailabilityQuery;
  }

  private async calculatePricing(
    manager: EntityManager,
    scope: TenantParkScope,
    unitId: string,
    arrivalValue: string,
    departureValue: string
  ) {
    const arrivalDate = arrivalValue.slice(0, 10);
    const departureDate = departureValue.slice(0, 10);
    const dates = this.businessDates(arrivalDate, departureDate);
    const config = await manager.getRepository(HomestayRateConfigEntity).findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId, isDeleted: false }
    });
    if (!config) throw new ConflictException("Homestay rate configuration is required");
    const overrides = await manager.getRepository(HomestayRateOverrideEntity).createQueryBuilder("rate")
      .where("rate.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rate.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rate.unit_id = :unitId", { unitId })
      .andWhere("rate.is_deleted = false")
      .andWhere("rate.business_date >= :arrivalDate", { arrivalDate })
      .andWhere("rate.business_date < :departureDate", { departureDate })
      .getMany();
    const byDate = new Map(overrides.map((item) => [item.businessDate, item.dailyRate]));
    const nights = dates.map((businessDate) => {
      const overrideRate = byDate.get(businessDate) ?? null;
      return {
        businessDate,
        baseRate: config.baseDailyRate,
        overrideRate,
        finalRate: overrideRate ?? config.baseDailyRate,
        priceSource: overrideRate ? "date_override" as const : "base" as const
      };
    });
    const totalCents = assertHomestayMoneyFitsNumeric(
      nights.reduce((sum, night) => sum + toMoneyCents(night.finalRate), 0n),
      "Homestay room total"
    );
    return {
      arrivalDate,
      departureDate,
      config,
      nights,
      total: formatMoneyCents(totalCents)
    };
  }

  private businessDates(startValue: string, endValue: string): string[] {
    assertBusinessDate(startValue, "arrival_date");
    assertBusinessDate(endValue, "departure_date");
    const start = this.businessDateStart(startValue);
    const end = this.businessDateStart(endValue);
    if (start >= end) {
      throw new BadRequestException("arrival_date must be before departure_date");
    }
    const result: string[] = [];
    for (let cursor = start.getTime(); cursor < end.getTime(); cursor += 24 * 60 * 60_000) {
      if (result.length >= 366) throw new BadRequestException("A booking cannot exceed 366 nights");
      result.push(new Date(cursor).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }));
    }
    return result;
  }

  private businessDateStart(value: string): Date {
    return new Date(`${value.slice(0, 10)}T00:00:00${HOMESTAY_TIME_ZONE_OFFSET}`);
  }

  private cancellationSnapshot(config: HomestayRateConfigEntity) {
    return {
      free_cancel_before_hours: config.freeCancelBeforeHours,
      late_cancel_fee_type: config.lateCancelFeeType,
      late_cancel_fee_value: config.lateCancelFeeValue,
      captured_at: new Date().toISOString()
    };
  }

  private calculateCancellationFee(
    booking: Pick<HomestayBookingEntity,
      "arrivalDate" | "roomAmount" | "cancellationPolicySnapshot">,
    cancellationEvaluationAt: string
  ): string {
    const policy = booking.cancellationPolicySnapshot;
    const hours = Number(policy.free_cancel_before_hours ?? 0);
    const cutoff = this.businessDateStart(booking.arrivalDate).getTime() - hours * 60 * 60_000;
    const evaluationTime = new Date(cancellationEvaluationAt).getTime();
    if (!Number.isFinite(evaluationTime)) {
      throw new ConflictException("Cancellation evaluation time is invalid");
    }
    if (evaluationTime <= cutoff) return "0.00";
    const value = formatHomestayMoney(String(policy.late_cancel_fee_value ?? "0"));
    if (policy.late_cancel_fee_type !== "percentage") return value;
    const numerator = toMoneyCents(booking.roomAmount) * toMoneyCents(value);
    return formatMoneyCents((numerator + 5_000n) / 10_000n);
  }

  private async createLedgerEntry(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    dto: RegisterHomestayLedgerEntryDto
  ) {
    const repository = manager.getRepository(HomestayLedgerEntryEntity);
    const owners = await manager.query(
      `SELECT currency FROM biz_homestay_booking
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR KEY SHARE`,
      [scope.tenantId, scope.parkId, bookingId]
    ) as Array<{ currency: string }>;
    if (owners.length !== 1) throw new NotFoundException("Homestay booking not found");
    return repository.save(repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      bookingId,
      entryType: dto.entry_type,
      chargeType: dto.charge_type.trim(),
      amount: formatHomestayMoney(dto.amount),
      currency: owners[0]!.currency,
      sourceLedgerEntryId: null,
      approvalExecutionKey: null,
      approvalEffectKind: null,
      approvalEffectLineKey: null,
      approvalEffectHash: null,
      paymentMethod: dto.payment_method?.trim() ?? null,
      paymentChannel: dto.payment_channel?.trim() ?? null,
      transactionReference: dto.transaction_reference?.trim() ?? null,
      status: "confirmed",
      reason: dto.reason.trim(),
      occurredAt: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub
    }));
  }

  private async resolveTurnoverPhotoFileIds(
    manager: EntityManager,
    scope: TenantParkScope,
    turnoverTaskId: string,
    fileIds: string[]
  ): Promise<string[]> {
    const requestedIds = [...new Set(fileIds.map((fileId) => fileId.trim()).filter(Boolean))];
    const files = await manager.getRepository(FileEntity).createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.biz_type = :bizType", { bizType: "homestay_turnover" })
      .andWhere("file.biz_id = :turnoverTaskId", { turnoverTaskId })
      .andWhere("file.status = 1")
      .andWhere("file.is_deleted = false")
      .setLock("pessimistic_write")
      .getMany();
    const associatedIds = files.map((file) => file.id);
    const associatedIdSet = new Set(associatedIds);
    if (requestedIds.some((fileId) => !associatedIdSet.has(fileId))) {
      throw new BadRequestException(
        "photo_file_ids must be active homestay_turnover files for this task in the current scope"
      );
    }
    return associatedIds;
  }

  private async voidIssuedCredentials(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string
  ): Promise<number> {
    const result = await manager.getRepository(HomestayStayCredentialEntity).update(
      {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        bookingId,
        status: "issued",
        isDeleted: false
      },
      {
        status: "void",
        updateBy: actor.sub
      }
    );
    return result.affected ?? 0;
  }

  private async lockBooking(manager: EntityManager, scope: TenantParkScope, id: string) {
    const booking = await manager.getRepository(HomestayBookingEntity).findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!booking) throw new NotFoundException("Homestay booking not found");
    return booking;
  }

  private async mustFindBooking(scope: TenantParkScope, id: string) {
    const booking = await this.bookingsRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!booking) throw new NotFoundException("Homestay booking not found");
    return booking;
  }

  private async mustFindRate(scope: TenantParkScope, unitId: string) {
    const config = await this.ratesRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId, isDeleted: false }
    });
    if (!config) throw new NotFoundException("Homestay rate configuration not found");
    return config;
  }

  private async assertUnitBookable(manager: EntityManager, scope: TenantParkScope, unitId: string) {
    const unit = await manager.getRepository(UnitEntity).findOne({
      where: { id: unitId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!unit) throw new NotFoundException("Unit not found");
    if (unit.status !== 1) throw new ConflictException("Unit must be active before booking");
    const config = await manager.getRepository(PropertyOperationConfigEntity).findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId, isDeleted: false }
    });
    if (!config || config.operatingMode !== "short_stay" || config.operatingStatus !== "enabled") {
      throw new ConflictException("Unit must be enabled for short-stay operation before booking");
    }
    const openTurnovers = await manager.getRepository(HomestayTurnoverTaskEntity).createQueryBuilder("task")
      .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.unit_id = :unitId", { unitId })
      .andWhere("task.status <> 'completed'")
      .andWhere("task.is_deleted = false")
      .getCount();
    if (openTurnovers > 0) throw new ConflictException("Unit turnover must be completed before booking");
  }

  private async assertActiveBookingOccupancy(
    manager: EntityManager,
    scope: TenantParkScope,
    booking: HomestayBookingEntity
  ): Promise<void> {
    if (!booking.occupancyId) throw new ConflictException("Booking occupancy is missing");
    const occupancy = await manager.getRepository(PropertyOccupancyEntity).findOne({
      where: {
        id: booking.occupancyId,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        unitId: booking.unitId,
        sourceDomain: "homestay",
        sourceType: "homestay_booking",
        sourceId: booking.id,
        status: "active",
        isDeleted: false
      },
      lock: { mode: "pessimistic_write" }
    });
    const expectedStart = this.businessDateStart(booking.arrivalDate).getTime();
    const expectedEnd = this.businessDateStart(booking.departureDate).getTime();
    if (
      !occupancy
      || occupancy.startAt.getTime() !== expectedStart
      || occupancy.endAt.getTime() !== expectedEnd
    ) {
      throw new ConflictException("Booking must retain its matching active occupancy before check-in");
    }
  }

  private assertStatus(booking: HomestayBookingEntity, allowed: string[], message: string): void {
    if (!allowed.includes(booking.status)) throw new ConflictException(message);
  }

  private projectBooking(
    booking: HomestayBookingEntity,
    canReadFinance: boolean
  ): HomestayBookingResponse {
    return {
      id: booking.id,
      bookingCode: booking.bookingCode,
      unitId: booking.unitId,
      arrivalDate: booking.arrivalDate,
      departureDate: booking.departureDate,
      status: booking.status,
      guestCount: booking.guestCount,
      sourceType: booking.sourceType,
      ...(canReadFinance
        ? {
            roomAmount: booking.roomAmount,
            adjustmentAmount: booking.adjustmentAmount,
            totalAmount: booking.totalAmount
          }
        : {})
    };
  }

  private projectCredential(
    credential: HomestayStayCredentialEntity
  ): HomestayCredentialResponse {
    return {
      id: credential.id,
      credentialType: credential.credentialType,
      credentialLabel: credential.credentialLabel,
      credentialReference: credential.credentialReference === null ? null : "***",
      status: credential.status,
      issuedAt: credential.issuedAt.toISOString(),
      returnedAt: credential.returnedAt?.toISOString() ?? null
    };
  }

  private projectTurnover(
    task: HomestayTurnoverTaskEntity,
    canReadFiles: boolean
  ): HomestayTurnoverResponse {
    return {
      id: task.id,
      bookingId: task.bookingId,
      unitId: task.unitId,
      status: task.status,
      assigneeId: task.assigneeId,
      assigneeName: task.assigneeName,
      ...(canReadFiles ? { photoFileIds: [...task.photoFileIds] } : {}),
      consumables: task.consumables.map((item) => ({ ...item })),
      exceptionDescription: task.exceptionDescription,
      linkedWorkOrderId: task.linkedWorkOrderId
    };
  }

  private async mustFindAuthorizedBooking(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ): Promise<HomestayBookingEntity> {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      throw new NotFoundException("Homestay booking not found");
    }
    if (allowedUnitIds === null) {
      const booking = await this.bookingsRepository.findOne({
        where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!booking) throw new NotFoundException("Homestay booking not found");
      return booking;
    }
    const builder = this.bookingsRepository.createQueryBuilder("booking")
      .where("booking.id = :id", { id })
      .andWhere("booking.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("booking.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("booking.is_deleted = false");
    builder.andWhere("booking.unit_id IN (:...allowedUnitIds)", { allowedUnitIds });
    const booking = await builder.getOne();
    if (!booking) throw new NotFoundException("Homestay booking not found");
    return booking;
  }

  private async assertUnitReadScope(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    unitId: string
  ): Promise<void> {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && !allowedUnitIds.includes(unitId)) {
      throw new NotFoundException("Unit not found");
    }
  }

  private async log(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    booking: HomestayBookingEntity,
    action: string,
    beforeStatus: string | null,
    afterStatus: string | null,
    reason?: string,
    snapshot: Record<string, unknown> = {}
  ) {
    const repository = manager.getRepository(HomestayBookingActionLogEntity);
    await repository.save(repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      bookingId: booking.id,
      action,
      beforeStatus,
      afterStatus,
      reason: reason?.trim() ?? null,
      snapshot,
      operatorId: actor.sub,
      operatorName: actor.realName?.trim() || actor.username,
      actionTime: new Date(),
      createTime: new Date()
    }));
  }

  private generateBookingCode(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `HS-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }

  private isUniqueViolation(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "23505");
  }
}
