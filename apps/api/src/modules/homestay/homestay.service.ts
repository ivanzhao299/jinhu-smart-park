import {
  Inject,
  Injectable,
  Optional
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_MODE_UNIT_USAGE_ALLOWLIST,
  SYSTEM_PERMISSIONS,
  deriveRentalSegment,
  type HomestayAvailabilityListResponse,
  type HomestayAvailabilityResponse,
  type HomestayBookingDetailResponse,
  type HomestayBookingListResponse,
  type HomestayDashboardResponse,
  type HomestayRateCalendarResponse,
  type HomestayStayListItem,
  type HomestayStayListResponse,
  type HomestayTurnoverDetailResponse,
  type HomestayTurnoverListResponse,
  type HomestayUnitCandidateListResponse,
  type PropertyApprovalCommandPort,
  type TenantParkScope,
  type UnitUsageType
} from "@jinhu/shared";
import {
  DataSource,
  type Repository,
  type SelectQueryBuilder
} from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FileEntity } from "../files/entities/file.entity";
import {
  PROPERTY_OCCUPANCY_PORT,
  type PropertyOccupancyPort
} from "../property-operations/property-occupancy.port";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
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
  HomestayBookingEntity,
  HomestayTurnoverTaskEntity
} from "./entities/homestay.entities";
import { HomestayWorkbenchQueryService } from "./homestay-workbench-query.service";
import { HomestayDashboardAvailabilityQueryService } from "./homestay-dashboard-availability-query.service";
import { HomestayRatesService } from "./homestay-rates.service";
import { HomestayBookingQueryService } from "./homestay-booking-query.service";
import {
  HomestayBookingCommandService,
  type HomestayApprovedCancellationInput
} from "./homestay-booking-command.service";
import { HomestayCancellationExecutorService } from "./homestay-cancellation-executor.service";
import { HomestayStayCommandService } from "./homestay-stay-command.service";
import { HomestayTurnoverService } from "./homestay-turnover.service";
import {
  HomestayFinanceService,
  type HomestayApprovedFinanceInput
} from "./homestay-finance.service";
import { HomestayTransactionSupportService } from "./homestay-transaction-support.service";
import {
  projectHomestayBooking
} from "./homestay-projections";

@Injectable()
export class HomestayService {
  constructor(
    private readonly ratesService: HomestayRatesService,
    private readonly dashboardAvailabilityQuery: HomestayDashboardAvailabilityQueryService,
    @InjectRepository(HomestayBookingEntity)
    private readonly bookingsRepository: Repository<HomestayBookingEntity>,
    @InjectRepository(HomestayTurnoverTaskEntity)
    private readonly turnoversRepository: Repository<HomestayTurnoverTaskEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    @InjectRepository(WorkOrderEntity)
    private readonly workOrdersRepository: Repository<WorkOrderEntity>,
    @Inject(PROPERTY_OCCUPANCY_PORT)
    private readonly propertyOccupanciesService: PropertyOccupancyPort,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataSource: DataSource,
    _configService: ConfigService = new ConfigService(),
    @Optional()
    private readonly workbenchQuery?: HomestayWorkbenchQueryService,
    @Optional()
    @Inject(PROPERTY_APPROVAL_COMMAND_PORT)
    _approvalCommands?: PropertyApprovalCommandPort,
    @Optional()
    private readonly identityVerifier?: PropertyIdentityVerificationService,
    @Optional()
    private readonly bookingQuery?: HomestayBookingQueryService,
    _transactionSupport: HomestayTransactionSupportService
      = new HomestayTransactionSupportService(),
    @Optional()
    private readonly bookingCommands?: HomestayBookingCommandService,
    @Optional()
    private readonly cancellationExecutor?: HomestayCancellationExecutorService,
    @Optional()
    private readonly stayCommands?: HomestayStayCommandService,
    @Optional()
    private readonly turnoverService?: HomestayTurnoverService,
    @Optional()
    private readonly financeService?: HomestayFinanceService
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
        AND unit.usage_type = ANY(ARRAY[${PROPERTY_MODE_UNIT_USAGE_ALLOWLIST.short_stay.join(",")}]::smallint[])
        AND unit.is_deleted = false${accessClause}`;
    const [items, countRows] = await Promise.all([
      this.dataSource.query(
        `SELECT unit.id, unit.unit_code AS "unitCode", unit.unit_name AS "unitName",
                unit.usage_type AS "usage_type"
         ${commonSql(itemAccessClause)}
         ORDER BY unit.unit_code ASC
         LIMIT $3 OFFSET $4`,
        params
      ) as Promise<Array<{ id: string; unitCode: string; unitName: string; usage_type: number }>>,
      this.dataSource.query(
        `SELECT count(*)::int AS total ${commonSql(countAccessClause)}`,
        allowedUnitIds === null
          ? [scope.tenantId, scope.parkId]
          : [scope.tenantId, scope.parkId, allowedUnitIds]
      ) as Promise<Array<{ total: number }>>
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    return {
      items: items.map((item) => ({
        ...item,
        usage_type: Number(item.usage_type) as UnitUsageType,
        rental_segment: deriveRentalSegment(Number(item.usage_type)),
        eligible: true,
        ineligible_reasons: []
      })),
      total,
      page: query.page,
      page_size: query.page_size
    };
  }

  async getRateCalendar(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    unitId: string,
    dateFrom: string,
    dateTo: string,
    responseVersion?: string
  ): Promise<HomestayRateCalendarResponse> {
    return this.ratesService.getRateCalendar(
      scope,
      actor,
      unitId,
      dateFrom,
      dateTo,
      responseVersion === "2"
    );
  }

  async upsertRate(scope: TenantParkScope, actor: JwtPrincipal, unitId: string, dto: UpsertHomestayRateDto) {
    return this.ratesService.upsertRate(scope, actor, unitId, dto);
  }

  async upsertRateOverride(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    unitId: string,
    dto: UpsertHomestayRateOverrideDto
  ) {
    return this.ratesService.upsertRateOverride(scope, actor, unitId, dto);
  }

  async listBookings(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayBookingQueryDto
  ): Promise<HomestayBookingListResponse> {
    return this.mustBookingQuery().listBookings(scope, actor, query);
  }

  async getBooking(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ): Promise<HomestayBookingDetailResponse> {
    return this.mustBookingQuery().getBooking(scope, actor, id);
  }

  private mustBookingQuery(): HomestayBookingQueryService {
    if (!this.bookingQuery) throw new Error("Homestay booking query service is unavailable");
    return this.bookingQuery;
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
      ...projectHomestayBooking(booking, canReadFinance),
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
    return this.mustBookingQuery().getStay(scope, actor, stayId);
  }

  async createBooking(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreateHomestayBookingDto,
    idempotencyKey?: string
  ) {
    return this.mustBookingCommands().createBooking(scope, actor, dto, idempotencyKey);
  }

  async confirmBooking(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.mustBookingCommands().confirmBooking(scope, actor, id);
  }

  async markNoShow(scope: TenantParkScope, actor: JwtPrincipal, id: string, reason: string) {
    return this.mustBookingCommands().markNoShow(scope, actor, id, reason);
  }

  async cancelBooking(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    reason: string,
    clientKey = ""
  ) {
    return this.mustBookingCommands().cancelBooking(scope, actor, id, reason, clientKey);
  }

  async executeApprovedCancellation(input: HomestayApprovedCancellationInput): Promise<void> {
    return this.mustCancellationExecutor().execute(input);
  }

  async rescheduleBooking(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: RescheduleHomestayBookingDto
  ) {
    return this.mustBookingCommands().rescheduleBooking(scope, actor, id, dto);
  }

  async addGuest(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    dto: AddHomestayGuestDto
  ) {
    return this.mustStayCommands().addGuest(scope, actor, bookingId, dto);
  }

  async issueCredential(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    dto: IssueHomestayCredentialDto
  ) {
    return this.mustStayCommands().issueCredential(scope, actor, bookingId, dto);
  }

  async returnCredential(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    credentialId: string
  ) {
    return this.mustStayCommands().returnCredential(scope, actor, bookingId, credentialId);
  }

  async markCredentialLost(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    credentialId: string,
    reason: string
  ) {
    return this.mustStayCommands().markCredentialLost(
      scope,
      actor,
      bookingId,
      credentialId,
      reason
    );
  }

  async checkIn(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.mustStayCommands().checkIn(scope, actor, id);
  }

  async checkOut(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.mustStayCommands().checkOut(scope, actor, id);
  }

  async registerLedgerEntry(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    dto: RegisterHomestayLedgerEntryDto,
    clientKey = ""
  ) {
    return this.mustFinance().registerLedgerEntry(scope, actor, bookingId, dto, clientKey);
  }

  async listFinanceApprovalSources(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    entryType: "refund" | "waiver"
  ) {
    return this.mustFinance().listApprovalSources(scope, actor, bookingId, entryType);
  }

  async executeApprovedFinance(input: HomestayApprovedFinanceInput): Promise<void> {
    return this.mustFinance().executeApprovedFinance(input);
  }

  async listTurnovers(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayTurnoverQueryDto
  ): Promise<HomestayTurnoverListResponse> {
    return this.mustTurnovers().listTurnovers(scope, actor, query);
  }

  async getTurnover(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ): Promise<HomestayTurnoverDetailResponse> {
    return this.mustTurnovers().getTurnover(scope, actor, id);
  }

  async executeTurnover(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    action: "start" | "complete" | "inspect" | "exception",
    dto: ExecuteHomestayTurnoverDto
  ) {
    return this.mustTurnovers().executeTurnover(scope, actor, id, action, dto);
  }

  async dashboard(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    businessDate?: string
  ): Promise<HomestayDashboardResponse> {
    return this.dashboardAvailabilityQuery.dashboard(scope, actor, businessDate);
  }

  async availability(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayAvailabilityQueryDto
  ): Promise<HomestayAvailabilityResponse | HomestayAvailabilityListResponse> {
    return this.dashboardAvailabilityQuery.availability(scope, actor, query);
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }

  private mustBookingCommands(): HomestayBookingCommandService {
    if (!this.bookingCommands) throw new Error("Homestay booking command service is unavailable");
    return this.bookingCommands;
  }

  private mustCancellationExecutor(): HomestayCancellationExecutorService {
    if (!this.cancellationExecutor) {
      throw new Error("Homestay cancellation executor service is unavailable");
    }
    return this.cancellationExecutor;
  }

  private mustStayCommands(): HomestayStayCommandService {
    if (!this.stayCommands) throw new Error("Homestay stay command service is unavailable");
    return this.stayCommands;
  }

  private mustTurnovers(): HomestayTurnoverService {
    if (!this.turnoverService) throw new Error("Homestay turnover service is unavailable");
    return this.turnoverService;
  }

  private mustFinance(): HomestayFinanceService {
    if (!this.financeService) throw new Error("Homestay finance service is unavailable");
    return this.financeService;
  }

}
