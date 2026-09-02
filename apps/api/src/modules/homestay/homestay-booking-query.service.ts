import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  SYSTEM_PERMISSIONS,
  type HomestayBookingDetailResponse,
  type HomestayBookingListItem,
  type HomestayBookingListResponse,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import type { HomestayBookingQueryDto } from "./dto/homestay.dto";
import {
  HomestayBookingActionLogEntity,
  HomestayBookingEntity,
  HomestayBookingGuestEntity,
  HomestayBookingNightEntity,
  HomestayLedgerEntryEntity,
  HomestayStayCredentialEntity,
  HomestayTurnoverTaskEntity
} from "./entities/homestay.entities";
import { formatHomestayLedgerSummary } from "./homestay-finance.policy";
import {
  projectHomestayBooking,
  projectHomestayCredential,
  projectHomestayTurnover
} from "./homestay-projections";

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

@Injectable()
export class HomestayBookingQueryService {
  constructor(
    @InjectRepository(HomestayBookingEntity)
    private readonly bookingsRepository: Repository<HomestayBookingEntity>,
    @InjectRepository(HomestayTurnoverTaskEntity)
    private readonly turnoversRepository: Repository<HomestayTurnoverTaskEntity>,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataSource: DataSource
  ) {}

  async listBookings(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayBookingQueryDto
  ): Promise<HomestayBookingListResponse> {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return { items: [], total: 0, page: query.page, page_size: query.page_size };
    }
    const builder = this.buildBookingListQuery(scope, query, allowedUnitIds);
    const [bookings, total] = await builder
      .addSelect(this.bookingOperationRankSql(), "booking_operation_rank")
      .orderBy("booking_operation_rank", "ASC")
      .addOrderBy("booking.arrival_date", "DESC")
      .addOrderBy("booking.create_time", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const unitDisplay = await this.loadUnitDisplay(scope, bookings);
    const canReadFinance = this.hasPermission(actor, SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_READ);
    const items = bookings.map((booking): HomestayBookingListItem => ({
      ...projectHomestayBooking(booking, canReadFinance, unitDisplay.get(booking.unitId))
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

  async getStay(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ): Promise<HomestayBookingDetailResponse> {
    return this.getBookingDetail(
      scope,
      actor,
      id,
      new Set(["confirmed", "checked_in", "checked_out"]),
      "Homestay stay not found"
    );
  }

  private buildBookingListQuery(
    scope: TenantParkScope,
    query: HomestayBookingQueryDto,
    allowedUnitIds: string[] | null
  ) {
    const builder = this.bookingsRepository.createQueryBuilder("booking")
      .where("booking.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("booking.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("booking.is_deleted = false");
    if (allowedUnitIds !== null) {
      builder.andWhere("booking.unit_id IN (:...allowedUnitIds)", { allowedUnitIds });
    }
    if (query.status) builder.andWhere("booking.status = :status", { status: query.status });
    if (query.unit_id) builder.andWhere("booking.unit_id = :unitId", { unitId: query.unit_id });
    if (query.keyword) {
      builder.andWhere("booking.booking_code ILIKE :bookingKeyword", {
        bookingKeyword: `%${query.keyword}%`
      });
    }
    if (query.date_from) {
      builder.andWhere("booking.departure_date > :dateFrom", { dateFrom: query.date_from.slice(0, 10) });
    }
    if (query.date_to) {
      builder.andWhere("booking.arrival_date < :dateTo", { dateTo: query.date_to.slice(0, 10) });
    }
    return builder;
  }

  private bookingOperationRankSql(): string {
    return `CASE
      WHEN booking.status = 'checked_in' THEN 0
      WHEN booking.status = 'confirmed' THEN 1
      WHEN booking.status = 'draft' THEN 2
      ELSE 3
    END`;
  }

  private async loadUnitDisplay(
    scope: TenantParkScope,
    bookings: HomestayBookingEntity[]
  ): Promise<Map<string, { unitCode: string | null; unitName: string | null }>> {
    if (bookings.length === 0) return new Map();
    const rows = await this.dataSource.query(
      `SELECT unit.id,
              unit.unit_code AS "unitCode",
              unit.unit_name AS "unitName"
       FROM biz_unit unit
       WHERE unit.tenant_id = $1
         AND unit.park_id = $2
         AND unit.is_deleted = false
         AND unit.id = ANY($3::uuid[])`,
      [scope.tenantId, scope.parkId, [...new Set(bookings.map((booking) => booking.unitId))]]
    ) as Array<{ id: string; unitCode: string | null; unitName: string | null }>;
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async getBookingDetail(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    allowedStatuses?: ReadonlySet<string>,
    missingMessage = "Homestay booking not found"
  ): Promise<HomestayBookingDetailResponse> {
    const booking = await this.mustFindAuthorizedBooking(scope, actor, id);
    if (allowedStatuses && !allowedStatuses.has(booking.status)) {
      throw new NotFoundException(missingMessage);
    }
    const access = this.bookingDetailAccess(actor);
    const [relations, unitDisplay] = await Promise.all([
      this.loadBookingDetailRelations(scope, id, access),
      this.loadUnitDisplay(scope, [booking])
    ]);
    return this.projectBookingDetail(
      booking,
      relations,
      access,
      unitDisplay.get(booking.unitId)
    );
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
      this.loadRelation(HomestayBookingNightEntity, scope, bookingId, { businessDate: "ASC" }),
      this.loadRelation(HomestayBookingGuestEntity, scope, bookingId),
      this.loadRelation(HomestayStayCredentialEntity, scope, bookingId),
      access.canReadFinance
        ? this.loadRelation(HomestayLedgerEntryEntity, scope, bookingId, { occurredAt: "ASC" })
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
    const guestDisplayNames = await this.loadGuestDisplayNames(scope, guests);
    return { nights, guests, credentials, ledger, actions, turnover, guestDisplayNames };
  }

  private loadRelation<T extends { bookingId: string }>(
    entity: new () => T,
    scope: TenantParkScope,
    bookingId: string,
    order?: Record<string, "ASC" | "DESC">
  ): Promise<T[]> {
    return this.dataSource.getRepository(entity).find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        bookingId,
        isDeleted: false
      } as never,
      ...(order ? { order } : {})
    } as never) as Promise<T[]>;
  }

  private async loadGuestDisplayNames(
    scope: TenantParkScope,
    guests: HomestayBookingGuestEntity[]
  ): Promise<ReadonlyMap<string, string>> {
    const partyIds = [...new Set(guests.map((guest) => guest.partyId))];
    if (partyIds.length === 0) return new Map();
    const rows = await this.dataSource.query(
      `SELECT party.id, party.display_name AS "displayName"
       FROM biz_party party
       WHERE party.tenant_id = $1
         AND party.park_id = $2
         AND party.id = ANY($3::uuid[])
         AND party.is_deleted = false`,
      [scope.tenantId, scope.parkId, partyIds]
    ) as Array<{ id: string; displayName: string }>;
    return new Map(rows.map((party) => [party.id, party.displayName]));
  }

  private projectBookingDetail(
    booking: HomestayBookingEntity,
    relations: BookingDetailRelations,
    access: BookingDetailAccess,
    unitDisplay?: { unitCode: string | null; unitName: string | null }
  ): HomestayBookingDetailResponse {
    return {
      booking: projectHomestayBooking(booking, access.canReadFinance, unitDisplay),
      nights: this.projectNights(relations.nights, access.canReadFinance),
      guests: relations.guests.map((guest) => ({
        id: guest.id,
        partyId: guest.partyId,
        partyDisplayName: relations.guestDisplayNames.get(guest.partyId) ?? "未命名住客",
        isPrimary: guest.isPrimary,
        verificationStatus: guest.verificationStatus
      })),
      credentials: relations.credentials.map(projectHomestayCredential),
      ...(access.canReadFinance ? this.projectFinance(relations.ledger) : {}),
      finance_visible: access.canReadFinance,
      actions: relations.actions.map((action) => ({
        id: action.id,
        action: action.action,
        beforeStatus: action.beforeStatus,
        afterStatus: action.afterStatus,
        reason: action.reason,
        operatorName: action.operatorName,
        actionTime: action.actionTime.toISOString()
      })),
      turnover: relations.turnover
        ? projectHomestayTurnover(relations.turnover, access.canReadTurnoverFiles)
        : null
    };
  }

  private projectNights(nights: HomestayBookingNightEntity[], canReadFinance: boolean) {
    return nights.map((night) => ({
      id: night.id,
      businessDate: night.businessDate,
      ...(canReadFinance
        ? {
            baseRate: night.baseRate,
            overrideRate: night.overrideRate,
            finalRate: night.finalRate,
            priceSource: night.priceSource
          }
        : {})
    }));
  }

  private projectFinance(ledger: HomestayLedgerEntryEntity[]) {
    return {
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
      .andWhere("booking.is_deleted = false")
      .andWhere("booking.unit_id IN (:...allowedUnitIds)", { allowedUnitIds });
    const booking = await builder.getOne();
    if (!booking) throw new NotFoundException("Homestay booking not found");
    return booking;
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }
}
