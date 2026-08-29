import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  type PropertyApprovalCommandPort,
  type TenantParkScope
} from "@jinhu/shared";
import { randomUUID } from "node:crypto";
import { DataSource, type EntityManager } from "typeorm";
import {
  assertPropertyHighRiskActionApprovalRequired
} from "../../shared/property-workbench/property-high-risk-stopship";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PartyEntity } from "../property-operations/entities/party.entity";
import {
  PROPERTY_OCCUPANCY_PORT,
  type PropertyOccupancyPort
} from "../property-operations/property-occupancy.port";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { RentalStatusProjectionService } from "../property-operations/rental-status-projection.service";
import type {
  CreateHomestayBookingDto,
  RescheduleHomestayBookingDto
} from "./dto/homestay.dto";
import {
  HomestayBookingEntity,
  HomestayBookingNightEntity,
  HomestayRateConfigEntity,
  HomestayRateOverrideEntity
} from "./entities/homestay.entities";
import {
  assertHomestayMoneyFitsNumeric,
  assertHomestayNoShowWindow,
  assertHomestayRescheduleFinanciallySafe,
  formatMoneyCents,
  homestayMoneyDifference,
  toMoneyCents
} from "./homestay-booking.policy";
import { calculateCancellableRoomCharge } from "./homestay-finance.policy";
import { HomestayTransactionSupportService } from "./homestay-transaction-support.service";

const HOLD_MINUTES = 30;

export interface HomestayApprovedCancellationInput {
  manager: EntityManager;
  requestId: string;
  executionIdempotencyKey: string;
  canonicalPayload: Readonly<Record<string, unknown>>;
  sourceExpectedVersion: number;
  request: { tenantId: string; parkId: string; sourceId: string; requesterId: string };
}

@Injectable()
export class HomestayBookingCommandService {
  constructor(
    private readonly unitAccessService: PropertyUnitAccessService,
    @Inject(PROPERTY_OCCUPANCY_PORT)
    private readonly propertyOccupanciesService: PropertyOccupancyPort,
    private readonly dataSource: DataSource,
    private readonly transactionSupport: HomestayTransactionSupportService,
    private readonly rentalStatusProjection: RentalStatusProjectionService,
    @Optional()
    @Inject(PROPERTY_APPROVAL_COMMAND_PORT)
    private readonly approvalCommands?: PropertyApprovalCommandPort
  ) {}

  async createBooking(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreateHomestayBookingDto,
    idempotencyKey?: string
  ) {
    await this.unitAccessService.assertAccess(scope, actor, dto.unit_id);
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.transactionSupport.assertUnitBookable(manager, scope, dto.unit_id);
        if (dto.booker_party_id) {
          const booker = await manager.getRepository(PartyEntity).findOne({ where: {
            id: dto.booker_party_id, tenantId: scope.tenantId, parkId: scope.parkId,
            partyType: "person", isDeleted: false
          } });
          if (!booker) throw new NotFoundException("Individual booker party not found");
        }
        const pricing = await this.calculatePricing(
          manager, scope, dto.unit_id, dto.arrival_date, dto.departure_date
        );
        const bookingRepository = manager.getRepository(HomestayBookingEntity);
        const booking = await bookingRepository.save(bookingRepository.create({
          tenantId: scope.tenantId, parkId: scope.parkId,
          bookingCode: dto.booking_code?.trim() || this.generateBookingCode(),
          unitId: dto.unit_id,
          bookerPartyId: dto.booker_party_id ?? null,
          occupancyId: null, status: "draft",
          arrivalDate: pricing.arrivalDate, departureDate: pricing.departureDate,
          expectedArrivalTime: dto.expected_arrival_time ? new Date(dto.expected_arrival_time) : null,
          sourceType: dto.source_type,
          channelName: dto.channel_name?.trim() ?? null,
          externalOrderNo: dto.external_order_no?.trim() ?? null,
          channelSyncStatus: dto.source_type === "ota_reserved" ? "reserved_not_connected" : "not_applicable",
          guestCount: dto.guest_count,
          currency: pricing.config.currency,
          roomAmount: pricing.total, adjustmentAmount: "0.00", totalAmount: pricing.total,
          cancellationPolicySnapshot: this.cancellationSnapshot(pricing.config),
          createBy: actor.sub, updateBy: actor.sub,
          remark: dto.remark?.trim() ?? null
        }));
        await manager.getRepository(HomestayBookingNightEntity).save(
          pricing.nights.map((night) => manager.getRepository(HomestayBookingNightEntity).create({
            tenantId: scope.tenantId, parkId: scope.parkId, bookingId: booking.id,
            ...night,
            createBy: actor.sub, updateBy: actor.sub
          }))
        );
        const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
        const occupancy = await this.propertyOccupanciesService.createInTransaction(
          manager, scope, actor, {
            unit_id: booking.unitId,
            source_domain: "homestay",
            source_type: "homestay_booking",
            source_id: booking.id,
            start_at: this.transactionSupport.businessDateStart(booking.arrivalDate).toISOString(),
            end_at: this.transactionSupport.businessDateStart(booking.departureDate).toISOString(),
            status: "held",
            hold_expires_at: holdExpiresAt.toISOString(),
            remark: `Homestay draft ${booking.bookingCode}`
          }, idempotencyKey
        );
        booking.occupancyId = occupancy.id;
        await bookingRepository.save(booking);
        await this.transactionSupport.log(
          manager, scope, actor, booking, "create", null, "draft", "人工创建民宿订单",
          { hold_expires_at: holdExpiresAt.toISOString(), room_amount: booking.roomAmount }
        );
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
      const booking = await this.transactionSupport.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (booking.status === "confirmed") return booking;
      this.transactionSupport.assertStatus(booking, ["draft"], "Only draft bookings can be confirmed");
      await this.transactionSupport.assertUnitBookable(manager, scope, booking.unitId);
      if (!booking.occupancyId) throw new ConflictException("Booking occupancy hold is missing");
      await this.propertyOccupanciesService.activateInTransaction(
        manager, scope, actor, booking.occupancyId
      );
      const before = booking.status;
      booking.status = "confirmed";
      booking.updateBy = actor.sub;
      const saved = await manager.getRepository(HomestayBookingEntity).save(booking);
      if (toMoneyCents(saved.roomAmount) > 0n) {
        await this.transactionSupport.createLedgerEntry(manager, scope, actor, saved.id, {
          entry_type: "charge",
          charge_type: "room",
          amount: saved.roomAmount,
          reason: "订单确认自动生成房费应收"
        });
      }
      await this.transactionSupport.log(
        manager, scope, actor, saved, "confirm", before, saved.status, "确认订单并锁房"
      );
      return saved;
    });
  }

  async markNoShow(scope: TenantParkScope, actor: JwtPrincipal, id: string, reason: string) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.transactionSupport.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (booking.status === "no_show") return booking;
      this.transactionSupport.assertStatus(
        booking, ["confirmed"], "Only confirmed bookings can be marked as no-show"
      );
      assertHomestayNoShowWindow(
        new Date(), this.transactionSupport.businessDateStart(booking.arrivalDate)
      );
      const revokedCredentials = await this.transactionSupport.voidIssuedCredentials(
        manager, scope, actor, id
      );
      if (booking.occupancyId) {
        await this.propertyOccupanciesService.releaseInTransaction(
          manager, scope, actor, booking.occupancyId, reason, "cancelled"
        );
      }
      const before = booking.status;
      booking.status = "no_show";
      booking.noShowAt = new Date();
      booking.updateBy = actor.sub;
      const saved = await manager.getRepository(HomestayBookingEntity).save(booking);
      const rentalStatus = await this.rentalStatusProjection.project({
        manager, scope, unitId: booking.unitId, actorId: actor.sub,
        actorName: actor.realName ?? actor.username, sourceType: "homestay_booking",
        sourceId: booking.id, action: "release"
      });
      await this.transactionSupport.log(
        manager, scope, actor, saved, "no_show", before, saved.status, reason, {
          revoked_credentials: revokedCredentials,
          rental_status_projection: rentalStatus
        }
      );
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
      const booking = await this.transactionSupport.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (booking.status === "cancelled") return booking;
      this.transactionSupport.assertStatus(
        booking, ["draft", "confirmed"], "Only draft or confirmed bookings can be cancelled"
      );
      const before = booking.status;
      const evaluationRows = await manager.query(
        `SELECT transaction_timestamp()::text AS "cancellationEvaluationAt"`
      ) as Array<{ cancellationEvaluationAt: string }>;
      const cancellationEvaluationAt = evaluationRows[0]?.cancellationEvaluationAt;
      if (!cancellationEvaluationAt) {
        throw new ConflictException("Cancellation evaluation time is unavailable");
      }
      const occupancyRows = booking.occupancyId ? await manager.query(
        `SELECT id::text AS id, version, status FROM biz_property_occupancy
          WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR UPDATE`,
        [scope.tenantId, scope.parkId, booking.occupancyId]
      ) as Array<{ id: string; version: number; status: string }> : [];
      if (booking.occupancyId && occupancyRows.length !== 1) throw new ConflictException("Booking occupancy changed");
      const occupancy = occupancyRows[0] ?? null;
      const credentials = await manager.query(
        `SELECT id::text AS id, version, status FROM biz_homestay_stay_credential
          WHERE tenant_id=$1 AND park_id=$2 AND booking_id=$3
            AND status='issued' AND is_deleted=false ORDER BY id FOR UPDATE`,
        [scope.tenantId, scope.parkId, id]
      ) as Array<{ id: string; version: number; status: string }>;
      const ledgerContributors = await this.transactionSupport.lockConfirmedHomestayLedger(
        manager, scope, booking.id);
      await this.transactionSupport.assertNoUnresolvedLegacyHomestayFinance(
        manager, scope, booking.id);
      const cancellationFee = before === "confirmed"
        ? this.transactionSupport.calculateCancellationFee(booking, cancellationEvaluationAt)
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
          canonicalPayload: this.cancellationPayload({ booking, actor, before, reason,
            cancellationEvaluationAt, occupancy, credentials, ledgerContributors,
            cancellableRoomCharge, cancellationFee, financialTotal }),
          payloadSchemaVersion: 1,
          amount: financialTotal === "0.00" ? null : financialTotal,
          currency: financialTotal === "0.00" ? null : booking.currency
        }
      );
    });
  }

  async rescheduleBooking(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: RescheduleHomestayBookingDto
  ) {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.transactionSupport.lockBooking(manager, scope, id);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      this.transactionSupport.assertStatus(
        booking, ["draft", "confirmed"], "Only draft or confirmed bookings can be rescheduled"
      );
      const beforeSnapshot = {
        arrival_date: booking.arrivalDate,
        departure_date: booking.departureDate,
        room_amount: booking.roomAmount,
        occupancy_id: booking.occupancyId
      };
      const pricing = await this.calculatePricing(
        manager, scope, booking.unitId, dto.arrival_date, dto.departure_date
      );
      const previousAmount = booking.roomAmount;
      const difference = homestayMoneyDifference(pricing.total, previousAmount);
      const differenceCents = toMoneyCents(difference);
      assertHomestayRescheduleFinanciallySafe(booking.status, differenceCents);
      if (!booking.occupancyId) throw new ConflictException("Booking occupancy is missing");
      const occupancy = await this.propertyOccupanciesService.replacePeriodInTransaction(
        manager, scope, actor, booking.occupancyId, {
          sourceDomain: "homestay",
          sourceType: "homestay_booking",
          sourceId: booking.id,
          startAt: this.transactionSupport.businessDateStart(booking.arrivalDate).toISOString(),
          endAt: this.transactionSupport.businessDateStart(booking.departureDate).toISOString(),
          status: booking.status === "confirmed" ? "active" : "held"
        },
        this.transactionSupport.businessDateStart(pricing.arrivalDate).toISOString(),
        this.transactionSupport.businessDateStart(pricing.departureDate).toISOString(),
        booking.status === "draft"
          ? new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString()
          : undefined
      );
      await manager.getRepository(HomestayBookingNightEntity).update(
        { tenantId: scope.tenantId, parkId: scope.parkId,
          bookingId: booking.id, isDeleted: false },
        { isDeleted: true, updateBy: actor.sub }
      );
      await manager.getRepository(HomestayBookingNightEntity).save(
        pricing.nights.map((night) => manager.getRepository(HomestayBookingNightEntity).create({
          tenantId: scope.tenantId, parkId: scope.parkId, bookingId: booking.id,
          ...night,
          createBy: actor.sub, updateBy: actor.sub
        }))
      );
      booking.arrivalDate = pricing.arrivalDate;
      booking.departureDate = pricing.departureDate;
      booking.occupancyId = occupancy.id;
      booking.roomAmount = pricing.total;
      booking.adjustmentAmount = difference;
      booking.totalAmount = pricing.total;
      booking.updateBy = actor.sub;
      const saved = await manager.getRepository(HomestayBookingEntity).save(booking);
      if (booking.status === "confirmed" && differenceCents !== 0n) {
        await this.transactionSupport.createLedgerEntry(manager, scope, actor, saved.id, {
          entry_type: "charge",
          charge_type: "reschedule_increase",
          amount: formatMoneyCents(differenceCents),
          reason: `订单改期差价：${dto.reason}`
        });
      }
      await this.transactionSupport.log(
        manager, scope, actor, saved, "reschedule", saved.status, saved.status, dto.reason, {
          before: beforeSnapshot, after: {
            arrival_date: saved.arrivalDate, departure_date: saved.departureDate,
            room_amount: saved.roomAmount, occupancy_id: saved.occupancyId
          },
          difference: saved.adjustmentAmount
        }
      );
      return saved;
    });
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
    const dates = this.transactionSupport.businessDates(arrivalDate, departureDate);
    const config = await manager.getRepository(HomestayRateConfigEntity).findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, unitId, isDeleted: false }
    });
    if (!config) throw new ConflictException("Homestay rate configuration is required");
    const overrides = await manager.getRepository(HomestayRateOverrideEntity)
      .createQueryBuilder("rate")
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

  private cancellationSnapshot(config: HomestayRateConfigEntity) {
    return {
      free_cancel_before_hours: config.freeCancelBeforeHours,
      late_cancel_fee_type: config.lateCancelFeeType,
      late_cancel_fee_value: config.lateCancelFeeValue,
      captured_at: new Date().toISOString()
    };
  }

  private cancellationPayload(input: {
    booking: HomestayBookingEntity;
    actor: JwtPrincipal;
    before: string;
    reason: string;
    cancellationEvaluationAt: string;
    occupancy: { id: string; version: number; status: string } | null;
    credentials: Array<{ id: string; version: number; status: string }>;
    ledgerContributors: Awaited<ReturnType<HomestayTransactionSupportService["lockConfirmedHomestayLedger"]>>;
    cancellableRoomCharge: string;
    cancellationFee: string;
    financialTotal: string;
  }) {
    return {
      bookingId: input.booking.id, unitId: input.booking.unitId, fromStatus: input.before,
      reason: input.reason.trim(),
      actorName: input.actor.realName?.trim() || input.actor.username,
      cancellationEvaluationAt: input.cancellationEvaluationAt,
      occupancy: input.occupancy ? { id: input.occupancy.id,
        expectedVersion: input.occupancy.version, beforeStatus: input.occupancy.status,
        afterStatus: "cancelled" } : null,
      credentials: input.credentials.map((row) => ({ id: row.id, expectedVersion: row.version,
        beforeStatus: row.status, afterStatus: "void" })),
      ledgerContributors: input.ledgerContributors.map((row) => ({ id: row.id,
        expectedVersion: row.version, status: row.status, entryType: row.entryType,
        chargeType: row.chargeType, amount: row.amount, currency: row.currency,
        sourceLedgerEntryId: row.sourceLedgerEntryId })),
      roomWaiverAmount: input.cancellableRoomCharge,
      cancellationFeeAmount: input.cancellationFee,
      currency: input.financialTotal === "0.00" ? null : input.booking.currency
    };
  }

  private generateBookingCode(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `HS-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private isUniqueViolation(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "23505");
  }

}
