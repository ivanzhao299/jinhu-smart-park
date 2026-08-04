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
  type HomestayBookingListResponse,
  type HomestayDashboardResponse,
  type HomestayRateCalendarResponse,
  type HomestayStayListItem,
  type HomestayStayListResponse,
  type HomestayTurnoverDetailResponse,
  type HomestayTurnoverListItem,
  type HomestayTurnoverListResponse,
  type HomestayUnitCandidateListResponse,
  type PropertyWorkbenchFileRef,
  type PropertyApprovalCommandPort,
  type PropertyApprovalJsonValue,
  type TenantParkScope
} from "@jinhu/shared";
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
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FileEntity } from "../files/entities/file.entity";
import { PropertyOccupanciesService } from "../property-operations/property-occupancies.service";
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
  HomestayLedgerEntryEntity,
  HomestayRateConfigEntity,
  HomestayTurnoverTaskEntity
} from "./entities/homestay.entities";
import {
  formatHomestayMoney,
  formatMoneyCents,
  toMoneyCents
} from "./homestay-booking.policy";
import {
  assertHomestayManualLedgerMutation,
  summarizeHomestayLedger
} from "./homestay-finance.policy";
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
import { HomestayTransactionSupportService } from "./homestay-transaction-support.service";
import {
  projectHomestayBooking,
  projectHomestayTurnover
} from "./homestay-projections";
import { propertyApprovalCanonicalHash } from "../property-approvals/property-approval.service";

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
    private readonly bookingQuery?: HomestayBookingQueryService,
    private readonly transactionSupport: HomestayTransactionSupportService
      = new HomestayTransactionSupportService(),
    @Optional()
    private readonly bookingCommands?: HomestayBookingCommandService,
    @Optional()
    private readonly cancellationExecutor?: HomestayCancellationExecutorService,
    @Optional()
    private readonly stayCommands?: HomestayStayCommandService
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
    return this.ratesService.getRateCalendar(scope, actor, unitId, dateFrom, dateTo);
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
    if (dto.entry_type === "refund" || dto.entry_type === "waiver") {
      assertPropertyHighRiskActionPermissions(actor, [SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_WAIVE,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE]);
      if (!this.approvalCommands) { assertPropertyHighRiskActionApprovalRequired("homestay.finance.refund-or-waive");
        throw new ConflictException("Property approval runtime is unavailable");
      }
    }
    const requiredPermission = dto.entry_type === "waiver"
      ? SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_WAIVE
      : SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_REGISTER;
    if (!this.hasPermission(actor, requiredPermission))
      throw new ForbiddenException(`${requiredPermission} permission is required`);
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.transactionSupport.lockBooking(manager, scope, bookingId);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (dto.entry_type === "refund" || dto.entry_type === "waiver") {
        if (!dto.source_ledger_entry_id) {
          throw new BadRequestException("source_ledger_entry_id is required for refund or waiver");
        }
        await this.transactionSupport.lockHomestayFinanceSourceKey(
          manager, scope, bookingId, dto.source_ledger_entry_id
        );
        const lockedSource = await this.transactionSupport.lockHomestayFinanceSource(
          manager, scope, bookingId, dto.source_ledger_entry_id
        );
        const ledger = await this.transactionSupport.lockConfirmedHomestayLedger(
          manager, scope, bookingId
        );
        await this.transactionSupport.assertNoUnresolvedLegacyHomestayFinance(
          manager, scope, bookingId
        );
        assertHomestayManualLedgerMutation(
          dto.entry_type, dto.amount, summarizeHomestayLedger(ledger)
        );
        const source = ledger.find((row) => row.id === dto.source_ledger_entry_id);
        const expectedSourceType = dto.entry_type === "refund" ? "payment" : "charge";
        if (!source || source.id !== lockedSource.id || source.version !== lockedSource.version
          || source.currency !== lockedSource.currency || source.entryType !== expectedSourceType) {
          throw new ConflictException(`${dto.entry_type} must reference a confirmed ${expectedSourceType} entry`);
        }
        const allocation = await this.transactionSupport.homestayFinanceAllocationSnapshot(
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
      return this.transactionSupport.createLedgerEntry(manager, scope, actor, bookingId, dto);
    });
  }

  async executeApprovedFinance(input: { manager: EntityManager; requestId: string;
    executionIdempotencyKey: string; canonicalPayload: Readonly<Record<string, unknown>>;
    sourceExpectedVersion: number;
    request: { tenantId: string; parkId: string; sourceId: string; requesterId: string } }): Promise<void> {
    const payload = input.canonicalPayload; if (!Array.isArray(payload.lines) || payload.lines.length !== 1)
      throw new ConflictException("Approval source changed");
    const line = payload.lines[0] as Record<string, unknown>;
    const bookingId = this.requiredApprovalUuid(payload.bookingId);
    const sourceId = this.requiredApprovalUuid(line.sourceLedgerEntryId);
    if (bookingId !== input.request.sourceId) throw new ConflictException("Approval source changed");
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    const bookings = await input.manager.query(
      `SELECT version,currency FROM biz_homestay_booking WHERE tenant_id=$1 AND park_id=$2
        AND id=$3 AND is_deleted=false FOR UPDATE`, [scope.tenantId, scope.parkId, bookingId]
    ) as Array<{ version: number; currency: string }>;
    await this.transactionSupport.lockHomestayFinanceSourceKey(
      input.manager, scope, bookingId, sourceId
    );
    const lockedSource = await this.transactionSupport.lockHomestayFinanceSource(
      input.manager, scope, bookingId, sourceId
    );
    const currentLedger = await this.transactionSupport.lockConfirmedHomestayLedger(
      input.manager, scope, bookingId
    );
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
    await this.transactionSupport.assertNoUnresolvedLegacyHomestayFinance(
      input.manager, scope, bookingId
    );
    assertHomestayManualLedgerMutation(
      String(line.entryType) as "refund" | "waiver",
      String(line.amount),
      summarizeHomestayLedger(currentLedger)
    );
    const allocation = await this.transactionSupport.homestayFinanceAllocationSnapshot(
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
      ...projectHomestayTurnover(task, canReadFiles),
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
      ...projectHomestayTurnover(task, canReadFiles),
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
    return this.dashboardAvailabilityQuery.dashboard(scope, actor, businessDate);
  }

  async availability(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayAvailabilityQueryDto
  ): Promise<HomestayAvailabilityResponse | HomestayAvailabilityListResponse> {
    return this.dashboardAvailabilityQuery.availability(scope, actor, query);
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

  private requiredApprovalUuid(value: unknown): string {
    if (typeof value !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new ConflictException("Approval payload is invalid");
    }
    return value;
  }

}
