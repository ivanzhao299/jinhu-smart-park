import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import { randomUUID } from "node:crypto";
import { DataSource, type EntityManager, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FileEntity } from "../files/entities/file.entity";
import { PartyEntity } from "../property-operations/entities/party.entity";
import { PropertyOccupancyEntity } from "../property-operations/entities/property-occupancy.entity";
import { PropertyOccupanciesService } from "../property-operations/property-occupancies.service";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import type {
  AddHomestayGuestDto,
  CreateHomestayBookingDto,
  ExecuteHomestayTurnoverDto,
  HomestayBookingQueryDto,
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

const HOMESTAY_TIME_ZONE_OFFSET = "+08:00";
const HOLD_MINUTES = 30;

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
    private readonly dataSource: DataSource
  ) {}

  async getRateCalendar(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    unitId: string,
    dateFrom: string,
    dateTo: string
  ) {
    await this.unitAccessService.assertAccess(scope, actor, unitId);
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
    if (dto.late_cancel_fee_type === "percentage" && dto.late_cancel_fee_value > 100) {
      throw new BadRequestException("Percentage cancellation fee cannot exceed 100");
    }
    let entity = await this.ratesRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId, isDeleted: false }
    });
    if (!entity) {
      entity = this.ratesRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        unitId,
        createBy: actor.sub
      });
    }
    entity.baseDailyRate = dto.base_daily_rate.toFixed(2);
    entity.currency = "CNY";
    entity.freeCancelBeforeHours = dto.free_cancel_before_hours;
    entity.lateCancelFeeType = dto.late_cancel_fee_type;
    entity.lateCancelFeeValue = dto.late_cancel_fee_value.toFixed(2);
    entity.checkoutRequiresInspection = dto.checkout_requires_inspection;
    entity.updateBy = actor.sub;
    return this.ratesRepository.save(entity);
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
    let entity = await this.overridesRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId, businessDate, isDeleted: false }
    });
    if (!entity) {
      entity = this.overridesRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        unitId,
        businessDate,
        createBy: actor.sub
      });
    }
    entity.dailyRate = dto.daily_rate.toFixed(2);
    entity.reason = dto.reason.trim();
    entity.updateBy = actor.sub;
    return this.overridesRepository.save(entity);
  }

  async listBookings(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayBookingQueryDto
  ): Promise<PaginatedResult<HomestayBookingEntity>> {
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
    if (query.date_from) builder.andWhere("booking.departure_date > :dateFrom", { dateFrom: query.date_from.slice(0, 10) });
    if (query.date_to) builder.andWhere("booking.arrival_date < :dateTo", { dateTo: query.date_to.slice(0, 10) });
    const [items, total] = await builder.orderBy("booking.arrival_date", "ASC")
      .addOrderBy("booking.create_time", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async getBooking(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    const booking = await this.mustFindBooking(scope, id);
    await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
    const [nights, guests, credentials, ledger, actions, turnover] = await Promise.all([
      this.dataSource.getRepository(HomestayBookingNightEntity).find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId: id, isDeleted: false },
        order: { businessDate: "ASC" }
      }),
      this.dataSource.getRepository(HomestayBookingGuestEntity).find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId: id, isDeleted: false }
      }),
      this.dataSource.getRepository(HomestayStayCredentialEntity).find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId: id, isDeleted: false }
      }),
      this.dataSource.getRepository(HomestayLedgerEntryEntity).find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId: id, isDeleted: false },
        order: { occurredAt: "ASC" }
      }),
      this.dataSource.getRepository(HomestayBookingActionLogEntity).find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId: id },
        order: { actionTime: "DESC" }
      }),
      this.turnoversRepository.findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId: id, isDeleted: false }
      })
    ]);
    return {
      booking,
      nights,
      guests,
      credentials,
      ledger,
      ledger_summary: this.ledgerSummary(ledger),
      actions,
      turnover
    };
  }

  async createBooking(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreateHomestayBookingDto,
    idempotencyKey?: string
  ) {
    await this.unitAccessService.assertAccess(scope, actor, dto.unit_id);
    return this.dataSource.transaction(async (manager) => {
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
        roomAmount: pricing.total.toFixed(2),
        adjustmentAmount: "0.00",
        totalAmount: pricing.total.toFixed(2),
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
  }

  async confirmBooking(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (booking.status === "confirmed") return booking;
      this.assertStatus(booking, ["draft"], "Only draft bookings can be confirmed");
      if (!booking.occupancyId) throw new ConflictException("Booking occupancy hold is missing");
      await this.propertyOccupanciesService.activateInTransaction(manager, scope, actor, booking.occupancyId);
      const before = booking.status;
      booking.status = "confirmed";
      booking.updateBy = actor.sub;
      const saved = await manager.getRepository(HomestayBookingEntity).save(booking);
      if (Number(saved.roomAmount) > 0) {
        await this.createLedgerEntry(manager, scope, actor, saved.id, {
          entry_type: "charge",
          charge_type: "room",
          amount: Number(saved.roomAmount),
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
      await this.log(manager, scope, actor, saved, "no_show", before, saved.status, reason);
      return saved;
    });
  }

  async cancelBooking(scope: TenantParkScope, actor: JwtPrincipal, id: string, reason: string) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (booking.status === "cancelled") return booking;
      this.assertStatus(booking, ["draft", "confirmed"], "Only draft or confirmed bookings can be cancelled");
      const before = booking.status;
      const cancellationFee = this.calculateCancellationFee(booking);
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
      booking.status = "cancelled";
      booking.cancelReason = reason.trim();
      booking.cancelledAt = new Date();
      booking.updateBy = actor.sub;
      const saved = await manager.getRepository(HomestayBookingEntity).save(booking);
      if (cancellationFee > 0) {
        await this.createLedgerEntry(manager, scope, actor, saved.id, {
          entry_type: "charge",
          charge_type: "cancellation_fee",
          amount: cancellationFee,
          reason: "按订单取消规则快照计算"
        });
      }
      await this.log(manager, scope, actor, saved, "cancel", before, saved.status, reason, {
        cancellation_fee: cancellationFee
      });
      return saved;
    });
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
        this.businessDateStart(pricing.arrivalDate).toISOString(),
        this.businessDateStart(pricing.departureDate).toISOString(),
        booking.status === "confirmed" ? "active" : "held",
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
      const previousAmount = Number(booking.roomAmount);
      booking.arrivalDate = pricing.arrivalDate;
      booking.departureDate = pricing.departureDate;
      booking.occupancyId = occupancy.id;
      booking.roomAmount = pricing.total.toFixed(2);
      booking.adjustmentAmount = (pricing.total - previousAmount).toFixed(2);
      booking.totalAmount = pricing.total.toFixed(2);
      booking.updateBy = actor.sub;
      const saved = await manager.getRepository(HomestayBookingEntity).save(booking);
      const difference = pricing.total - previousAmount;
      if (booking.status === "confirmed" && difference !== 0) {
        await this.createLedgerEntry(manager, scope, actor, saved.id, {
          entry_type: difference > 0 ? "charge" : "waiver",
          charge_type: difference > 0 ? "reschedule_increase" : "reschedule_decrease",
          amount: Math.abs(difference),
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
    const booking = await this.mustFindBooking(scope, bookingId);
    await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
    const party = await this.dataSource.getRepository(PartyEntity).findOne({
      where: { id: dto.party_id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!party || party.partyType !== "person") throw new NotFoundException("Guest party not found");
    const repository = this.dataSource.getRepository(HomestayBookingGuestEntity);
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
    entity.isPrimary = dto.is_primary;
    entity.verificationStatus = dto.verification_status;
    entity.verifiedBy = dto.verification_status === "verified" ? actor.sub : null;
    entity.verifiedAt = dto.verification_status === "verified" ? new Date() : null;
    entity.updateBy = actor.sub;
    return repository.save(entity);
  }

  async issueCredential(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    dto: IssueHomestayCredentialDto
  ) {
    const booking = await this.mustFindBooking(scope, bookingId);
    this.assertStatus(booking, ["confirmed", "checked_in"], "Credentials require a confirmed or checked-in booking");
    await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
    const repository = this.dataSource.getRepository(HomestayStayCredentialEntity);
    return repository.save(repository.create({
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
  }

  async returnCredential(scope: TenantParkScope, actor: JwtPrincipal, bookingId: string, credentialId: string) {
    const booking = await this.mustFindBooking(scope, bookingId);
    await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
    const repository = this.dataSource.getRepository(HomestayStayCredentialEntity);
    const credential = await repository.findOne({
      where: { id: credentialId, bookingId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!credential) throw new NotFoundException("Stay credential not found");
    credential.status = "returned";
    credential.returnedAt = new Date();
    credential.updateBy = actor.sub;
    return repository.save(credential);
  }

  async checkIn(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (booking.status === "checked_in") return booking;
      this.assertStatus(booking, ["confirmed"], "Only confirmed bookings can check in");
      const verifiedGuests = await manager.getRepository(HomestayBookingGuestEntity).count({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          bookingId: id,
          verificationStatus: "verified",
          isDeleted: false
        }
      });
      if (verifiedGuests < 1) throw new ConflictException("At least one verified guest is required");
      const issuedCredentials = await manager.getRepository(HomestayStayCredentialEntity).count({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, bookingId: id, status: "issued", isDeleted: false }
      });
      if (issuedCredentials < 1) throw new ConflictException("At least one issued key, card, or voucher is required");
      const before = booking.status;
      booking.status = "checked_in";
      booking.actualCheckInTime = new Date();
      booking.updateBy = actor.sub;
      const saved = await manager.getRepository(HomestayBookingEntity).save(booking);
      await this.log(manager, scope, actor, saved, "check_in", before, saved.status, "办理入住");
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
        .andWhere("occupancy.status IN ('held', 'active')")
        .andWhere("occupancy.start_at > :now", { now: now.toISOString() })
        .orderBy("occupancy.start_at", "ASC")
        .getOne();
      const turnoverEnd = future?.startAt ?? new Date(now.getTime() + 365 * 24 * 60 * 60_000);
      if (turnoverEnd.getTime() <= now.getTime()) throw new ConflictException("No turnover window is available");
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
      const turnoverOccupancy = await this.propertyOccupanciesService.createInTransaction(manager, scope, actor, {
        unit_id: booking.unitId,
        source_domain: "operations",
        source_type: "homestay_turnover",
        source_id: task.id,
        start_at: now.toISOString(),
        end_at: turnoverEnd.toISOString(),
        status: "active",
        remark: `Turnover after ${booking.bookingCode}`
      });
      task.occupancyId = turnoverOccupancy.id;
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
    dto: RegisterHomestayLedgerEntryDto
  ) {
    const booking = await this.mustFindBooking(scope, bookingId);
    await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
    if (dto.entry_type === "waiver" && !this.hasPermission(actor, SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_WAIVE)) {
      throw new ForbiddenException("homestay:finance:waive permission is required");
    }
    return this.createLedgerEntry(this.dataSource.manager, scope, actor, bookingId, dto);
  }

  async listTurnovers(scope: TenantParkScope, actor: JwtPrincipal, status?: string) {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) return [];
    const builder = this.turnoversRepository.createQueryBuilder("task")
      .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.is_deleted = false");
    if (allowedUnitIds !== null) builder.andWhere("task.unit_id IN (:...allowedUnitIds)", { allowedUnitIds });
    if (status) builder.andWhere("task.status = :status", { status });
    return builder.orderBy("task.create_time", "ASC").getMany();
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
        task.photoFileIds = await this.resolveTurnoverPhotoFileIds(scope, task.id, dto.photo_file_ids);
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

  async dashboard(scope: TenantParkScope, actor: JwtPrincipal, businessDate?: string) {
    const date = businessDate?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return {
        business_date: date,
        arrivals: 0,
        departures: 0,
        occupied: 0,
        rentable_units: 0,
        occupancy_rate: "0.00",
        average_daily_rate: "0.00",
        pending_turnovers: 0,
        revenue: "0.00"
      };
    }
    const unitClause = allowedUnitIds === null ? "" : " AND booking.unit_id = ANY($4::uuid[])";
    const parameters: unknown[] = [scope.tenantId, scope.parkId, date];
    if (allowedUnitIds !== null) parameters.push(allowedUnitIds);
    const [summary] = await this.dataSource.query(
      `SELECT
         count(*) FILTER (WHERE booking.arrival_date = $3::date AND booking.status IN ('confirmed','checked_in'))::int AS arrivals,
         count(*) FILTER (WHERE booking.departure_date = $3::date AND booking.status IN ('checked_in','checked_out'))::int AS departures,
         count(*) FILTER (WHERE booking.status = 'checked_in')::int AS occupied
       FROM biz_homestay_booking booking
       WHERE booking.tenant_id = $1 AND booking.park_id = $2 AND booking.is_deleted = false${unitClause}`,
      parameters
    ) as Array<{ arrivals: number; departures: number; occupied: number }>;
    const pendingTurnovers = await this.turnoversRepository.createQueryBuilder("task")
      .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.is_deleted = false")
      .andWhere("task.status <> 'completed'")
      .andWhere(allowedUnitIds === null ? "1=1" : "task.unit_id IN (:...allowedUnitIds)", { allowedUnitIds: allowedUnitIds ?? [] })
      .getCount();
    const [finance] = await this.dataSource.query(
      `SELECT COALESCE(sum(CASE WHEN entry.entry_type = 'payment' THEN entry.amount
                               WHEN entry.entry_type = 'refund' THEN -entry.amount ELSE 0 END), 0)::text AS revenue
       FROM biz_homestay_ledger_entry entry
       JOIN biz_homestay_booking booking ON booking.id = entry.booking_id
       WHERE entry.tenant_id = $1 AND entry.park_id = $2
         AND entry.is_deleted = false AND entry.status = 'confirmed'
         AND entry.occurred_at::date = $3::date${unitClause}`,
      parameters
    ) as Array<{ revenue: string }>;
    const modeParameters: unknown[] = [scope.tenantId, scope.parkId];
    const modeUnitClause = allowedUnitIds === null ? "" : " AND config.unit_id = ANY($3::uuid[])";
    if (allowedUnitIds !== null) modeParameters.push(allowedUnitIds);
    const [capacity] = await this.dataSource.query(
      `SELECT count(*)::int AS rentable_units
       FROM biz_property_operation_config config
       WHERE config.tenant_id = $1
         AND config.park_id = $2
         AND config.is_deleted = false
         AND config.operating_mode = 'short_stay'
         AND config.operating_status = 'enabled'${modeUnitClause}`,
      modeParameters
    ) as Array<{ rentable_units: number }>;
    const [rateSummary] = await this.dataSource.query(
      `SELECT COALESCE(avg(night.final_rate), 0)::text AS average_daily_rate
       FROM biz_homestay_booking_night night
       JOIN biz_homestay_booking booking ON booking.id = night.booking_id
       WHERE night.tenant_id = $1
         AND night.park_id = $2
         AND night.is_deleted = false
         AND booking.is_deleted = false
         AND booking.status IN ('confirmed', 'checked_in', 'checked_out')
         AND night.business_date = $3::date${unitClause}`,
      parameters
    ) as Array<{ average_daily_rate: string }>;
    const rentableUnits = Number(capacity?.rentable_units ?? 0);
    const occupied = Number(summary?.occupied ?? 0);
    return {
      business_date: date,
      arrivals: summary?.arrivals ?? 0,
      departures: summary?.departures ?? 0,
      occupied,
      rentable_units: rentableUnits,
      occupancy_rate: rentableUnits > 0 ? ((occupied / rentableUnits) * 100).toFixed(2) : "0.00",
      average_daily_rate: Number(rateSummary?.average_daily_rate ?? 0).toFixed(2),
      pending_turnovers: pendingTurnovers,
      revenue: finance?.revenue ?? "0.00"
    };
  }

  async availability(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dateFrom: string,
    dateTo: string
  ) {
    if (!dateFrom || !dateTo) {
      throw new BadRequestException("date_from and date_to are required");
    }
    this.businessDates(dateFrom, dateTo);
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) return [];
    const parameters: unknown[] = [
      scope.tenantId,
      scope.parkId,
      this.businessDateStart(dateFrom).toISOString(),
      this.businessDateStart(dateTo).toISOString()
    ];
    const unitClause = allowedUnitIds === null ? "" : " AND unit.id = ANY($5::uuid[])";
    if (allowedUnitIds !== null) parameters.push(allowedUnitIds);
    return this.dataSource.query(
      `SELECT unit.id AS unit_id,
              unit.unit_code,
              unit.unit_name,
              mode.operating_mode AS operation_mode,
              CASE
                WHEN mode.operating_mode IS DISTINCT FROM 'short_stay' THEN 'mode_unavailable'
                WHEN bool_or(occupancy.source_type = 'homestay_turnover') THEN 'turnover'
                WHEN bool_or(occupancy.status IN ('held', 'active')) THEN 'occupied'
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
        AND (occupancy.status <> 'held' OR occupancy.hold_expires_at IS NULL OR occupancy.hold_expires_at > now())
        AND occupancy.start_at < $4::timestamptz
        AND occupancy.end_at > $3::timestamptz
       WHERE unit.tenant_id = $1
         AND unit.park_id = $2
         AND unit.is_deleted = false${unitClause}
       GROUP BY unit.id, unit.unit_code, unit.unit_name, mode.operating_mode
       ORDER BY unit.unit_code`,
      parameters
    );
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
    return {
      arrivalDate,
      departureDate,
      config,
      nights,
      total: nights.reduce((sum, night) => sum + Number(night.finalRate), 0)
    };
  }

  private businessDates(startValue: string, endValue: string): string[] {
    const start = this.businessDateStart(startValue.slice(0, 10));
    const end = this.businessDateStart(endValue.slice(0, 10));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
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

  private calculateCancellationFee(booking: HomestayBookingEntity): number {
    const policy = booking.cancellationPolicySnapshot;
    const hours = Number(policy.free_cancel_before_hours ?? 0);
    const cutoff = this.businessDateStart(booking.arrivalDate).getTime() - hours * 60 * 60_000;
    if (Date.now() <= cutoff) return 0;
    const value = Number(policy.late_cancel_fee_value ?? 0);
    return policy.late_cancel_fee_type === "percentage"
      ? Math.round(Number(booking.roomAmount) * value) / 100
      : value;
  }

  private async createLedgerEntry(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    dto: RegisterHomestayLedgerEntryDto
  ) {
    const repository = manager.getRepository(HomestayLedgerEntryEntity);
    return repository.save(repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      bookingId,
      entryType: dto.entry_type,
      chargeType: dto.charge_type.trim(),
      amount: dto.amount.toFixed(2),
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
    scope: TenantParkScope,
    turnoverTaskId: string,
    fileIds: string[]
  ): Promise<string[]> {
    const ids = [...new Set(fileIds.map((fileId) => fileId.trim()).filter(Boolean))];
    if (ids.length === 0) return [];
    const count = await this.filesRepository.createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.id IN (:...ids)", { ids })
      .andWhere("file.biz_type = :bizType", { bizType: "homestay_turnover" })
      .andWhere("file.biz_id = :turnoverTaskId", { turnoverTaskId })
      .andWhere("file.status = 1")
      .andWhere("file.is_deleted = false")
      .getCount();
    if (count !== ids.length) {
      throw new BadRequestException(
        "photo_file_ids must be active homestay_turnover files for this task in the current scope"
      );
    }
    return ids;
  }

  private ledgerSummary(entries: HomestayLedgerEntryEntity[]) {
    const totals = { charges: 0, payments: 0, refunds: 0, waivers: 0, balance: 0 };
    for (const entry of entries) {
      if (entry.status === "void") continue;
      const amount = Number(entry.amount);
      if (entry.entryType === "charge") totals.charges += amount;
      if (entry.entryType === "payment") totals.payments += amount;
      if (entry.entryType === "refund") totals.refunds += amount;
      if (entry.entryType === "waiver") totals.waivers += amount;
    }
    totals.balance = totals.charges - totals.payments + totals.refunds - totals.waivers;
    return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value.toFixed(2)]));
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

  private assertStatus(booking: HomestayBookingEntity, allowed: string[], message: string): void {
    if (!allowed.includes(booking.status)) throw new ConflictException(message);
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
}
