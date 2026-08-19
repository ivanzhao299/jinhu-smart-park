import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { PropertyApprovalJsonValue, TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PropertyOperationConfigEntity } from "../property-operations/entities/property-operation-config.entity";
import { PropertyOccupancyEntity } from "../property-operations/entities/property-occupancy.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import type { RegisterHomestayLedgerEntryDto } from "./dto/homestay.dto";
import {
  HomestayBookingActionLogEntity,
  HomestayBookingEntity,
  HomestayLedgerEntryEntity,
  HomestayStayCredentialEntity,
  HomestayTurnoverTaskEntity
} from "./entities/homestay.entities";
import {
  assertBusinessDate,
  formatHomestayMoney,
  formatMoneyCents,
  toMoneyCents
} from "./homestay-booking.policy";

const HOMESTAY_TIME_ZONE_OFFSET = "+08:00";

export interface HomestayLedgerSnapshotRow {
  id: string;
  version: number;
  entryType: "charge" | "payment" | "refund" | "waiver";
  chargeType: string;
  amount: string;
  currency: string;
  status: "confirmed";
  sourceLedgerEntryId: string | null;
  recordedBy: string | null;
  occurredAt: string;
}

interface HomestayLegacyFinanceMappingRow {
  resultId: string;
  sourceExpectedVersion: number;
  currency: string;
}

@Injectable()
export class HomestayTransactionSupportService {
  calculateCancellationFee(
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

  businessDates(startValue: string, endValue: string): string[] {
    assertBusinessDate(startValue, "arrival_date");
    assertBusinessDate(endValue, "departure_date");
    const start = this.businessDateStart(startValue);
    const end = this.businessDateStart(endValue);
    if (start >= end) {
      throw new BadRequestException("arrival_date must be before departure_date");
    }
    const result: string[] = [];
    for (let cursor = start.getTime(); cursor < end.getTime(); cursor += 86_400_000) {
      if (result.length >= 366) throw new BadRequestException("A booking cannot exceed 366 nights");
      result.push(new Date(cursor).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }));
    }
    return result;
  }

  businessDateStart(value: string): Date {
    return new Date(`${value.slice(0, 10)}T00:00:00${HOMESTAY_TIME_ZONE_OFFSET}`);
  }

  async lockBooking(
    manager: EntityManager,
    scope: TenantParkScope,
    id: string
  ): Promise<HomestayBookingEntity> {
    const booking = await manager.getRepository(HomestayBookingEntity).findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      lock: { mode: "pessimistic_write" }
    });
    if (!booking) throw new NotFoundException("Homestay booking not found");
    return booking;
  }

  assertStatus(booking: HomestayBookingEntity, allowed: string[], message: string): void {
    if (!allowed.includes(booking.status)) throw new ConflictException(message);
  }

  async assertUnitBookable(
    manager: EntityManager,
    scope: TenantParkScope,
    unitId: string
  ): Promise<void> {
    await manager.query("SELECT lock_property_unit_scope($1, $2, $3)", [scope.tenantId, scope.parkId, unitId]);
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
    const openTurnovers = await manager.getRepository(HomestayTurnoverTaskEntity)
      .createQueryBuilder("task")
      .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.unit_id = :unitId", { unitId })
      .andWhere("task.status <> 'completed'")
      .andWhere("task.is_deleted = false")
      .getCount();
    if (openTurnovers > 0) {
      throw new ConflictException("Unit turnover must be completed before booking");
    }
  }

  async assertActiveBookingOccupancy(
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
    if (!occupancy
      || occupancy.startAt.getTime() !== expectedStart
      || occupancy.endAt.getTime() !== expectedEnd) {
      throw new ConflictException("Booking must retain its matching active occupancy before check-in");
    }
  }

  async voidIssuedCredentials(
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
      { status: "void", updateBy: actor.sub }
    );
    return result.affected ?? 0;
  }

  async createLedgerEntry(
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

  async log(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    booking: HomestayBookingEntity,
    action: string,
    beforeStatus: string | null,
    afterStatus: string | null,
    reason?: string,
    snapshot: Record<string, unknown> = {}
  ): Promise<void> {
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

  lockConfirmedHomestayLedger(
    manager: EntityManager,
    scope: TenantParkScope,
    bookingId: string
  ): Promise<HomestayLedgerSnapshotRow[]> {
    return manager.query(
      `SELECT id::text AS id, version, entry_type AS "entryType", charge_type AS "chargeType",
              amount::text AS amount, currency, status,
              source_ledger_entry_id::text AS "sourceLedgerEntryId",
              create_by::text AS "recordedBy",occurred_at::text AS "occurredAt"
         FROM biz_homestay_ledger_entry
        WHERE tenant_id=$1 AND park_id=$2 AND booking_id=$3
          AND status='confirmed' AND is_deleted=false
        ORDER BY id FOR UPDATE`,
      [scope.tenantId, scope.parkId, bookingId]
    ) as Promise<HomestayLedgerSnapshotRow[]>;
  }

  async assertNoUnresolvedLegacyHomestayFinance(
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

  async lockHomestayFinanceSourceKey(
    manager: EntityManager,
    scope: TenantParkScope,
    bookingId: string,
    sourceLedgerEntryId: string
  ): Promise<void> {
    const canonicalKey = [
      "homestay-finance-source",
      scope.tenantId,
      scope.parkId,
      bookingId,
      sourceLedgerEntryId
    ].join("|");
    await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [canonicalKey]);
  }

  async lockHomestayFinanceSource(
    manager: EntityManager,
    scope: TenantParkScope,
    bookingId: string,
    sourceLedgerEntryId: string
  ): Promise<HomestayLedgerSnapshotRow> {
    const rows = await manager.query(
      `SELECT id::text AS id,version,entry_type AS "entryType",charge_type AS "chargeType",
              amount::text AS amount,currency,status,
              source_ledger_entry_id::text AS "sourceLedgerEntryId",
              create_by::text AS "recordedBy",occurred_at::text AS "occurredAt"
         FROM biz_homestay_ledger_entry
        WHERE tenant_id=$1 AND park_id=$2 AND booking_id=$3 AND id=$4
          AND status='confirmed' AND is_deleted=false
        FOR UPDATE`,
      [scope.tenantId, scope.parkId, bookingId, sourceLedgerEntryId]
    ) as HomestayLedgerSnapshotRow[];
    if (rows.length !== 1) throw new ConflictException("Finance allocation source changed");
    return rows[0]!;
  }

  async homestayFinanceAllocationSnapshot(
    manager: EntityManager,
    scope: TenantParkScope,
    source: HomestayLedgerSnapshotRow,
    lockedLedger: HomestayLedgerSnapshotRow[],
    entryType: "refund" | "waiver"
  ): Promise<{
    allocatedCents: bigint;
    contributors: Array<Record<string, PropertyApprovalJsonValue>>;
  }> {
    const mapped = await this.loadLegacyMappings(manager, scope, source.id);
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
      return [{
        id: row.id,
        expectedVersion: row.version,
        status: row.status,
        entryType: row.entryType,
        amount: row.amount,
        currency: row.currency,
        allocationKind: direct ? "direct" : "legacy-mapped"
      }];
    }).sort((left, right) => String(left.id).localeCompare(String(right.id)));
    return {
      allocatedCents: contributors.reduce(
        (sum, row) => sum + toMoneyCents(String(row.amount)), 0n
      ),
      contributors
    };
  }

  private loadLegacyMappings(
    manager: EntityManager,
    scope: TenantParkScope,
    sourceLedgerEntryId: string
  ): Promise<HomestayLegacyFinanceMappingRow[]> {
    return manager.query(
      `SELECT result_ledger_entry_id::text AS "resultId",
              source_expected_version AS "sourceExpectedVersion",currency
         FROM biz_homestay_legacy_finance_source_map
        WHERE tenant_id=$1 AND park_id=$2 AND source_ledger_entry_id=$3
        ORDER BY result_ledger_entry_id FOR SHARE`,
      [scope.tenantId, scope.parkId, sourceLedgerEntryId]
    ) as Promise<HomestayLegacyFinanceMappingRow[]>;
  }
}
