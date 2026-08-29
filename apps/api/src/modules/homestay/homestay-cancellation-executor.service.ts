import { ConflictException, Injectable } from "@nestjs/common";
import type { PropertyApprovalJsonValue } from "@jinhu/shared";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { propertyApprovalCanonicalHash } from "../property-approvals/property-approval.service";
import { RentalStatusProjectionService } from "../property-operations/rental-status-projection.service";
import { formatMoneyCents, toMoneyCents } from "./homestay-booking.policy";
import { calculateCancellableRoomCharge } from "./homestay-finance.policy";
import type { HomestayApprovedCancellationInput } from "./homestay-booking-command.service";
import { HomestayTransactionSupportService } from "./homestay-transaction-support.service";

type CancellationScope = { tenantId: string; parkId: string };
type CancellationBooking = {
  id: string; unitId: string; occupancyId: string | null; status: string;
  currency: string; version: number; arrivalDate: string; roomAmount: string;
  cancellationPolicySnapshot: Record<string, unknown>;
};

@Injectable()
export class HomestayCancellationExecutorService {
  constructor(
    private readonly transactionSupport: HomestayTransactionSupportService,
    private readonly rentalStatusProjection: RentalStatusProjectionService
  ) {}

  async execute(input: HomestayApprovedCancellationInput): Promise<void> {
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
    ) as CancellationBooking[];
    const booking = bookings[0];
    if (!booking || booking.version !== input.sourceExpectedVersion
      || booking.status !== payload.fromStatus || booking.unitId !== payload.unitId
      || (booking.occupancyId === null) !== (payload.occupancy === null)) {
      throw new ConflictException("Approval source changed");
    }
    const state = await this.loadFrozenContributors(input, scope, booking, bookingId);
    const manifests = await input.manager.query(
      `SELECT effect_kind AS "effectKind", effect_line_key AS "effectLineKey",
              invariant_hash AS "effectHash", line_amount AS "lineAmount", currency
         FROM biz_property_execution_effect_manifest
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3 ORDER BY effect_ordinal`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as Array<{ effectKind: string; effectLineKey: string; effectHash: string;
      lineAmount: string | null; currency: string | null }>;
    const byKind = new Map(manifests.map((row) => [row.effectKind, row]));
    const bookingEffect = byKind.get("homestay.booking.cancel");
    if (!bookingEffect) throw new ConflictException("Approval effect manifest missing");
    if ((toMoneyCents(state.roomWaiverAmount) > 0n) !== byKind.has("homestay.ledger.waiver")
      || (toMoneyCents(state.cancellationFeeAmount) > 0n) !== byKind.has("homestay.ledger.charge")) {
      throw new ConflictException("Approval effect manifest missing");
    }
    await this.applyCredentialEffects(input, scope, state.currentCredentials);
    await this.applyOccupancyEffect(input, scope, state.occupancy, state.frozenOccupancy);
    await this.applyBookingEffect(input, scope, bookingId, booking.status);
    const rentalStatusProjection = booking.status === "confirmed"
      ? await this.rentalStatusProjection.project({
        manager: input.manager, scope, unitId: booking.unitId,
        actorId: input.request.requesterId,
        actorName: String(input.canonicalPayload.actorName ?? "审批申请人"),
        sourceType: "homestay_booking", sourceId: bookingId, action: "release"
      }) : null;
    await this.applyLedgerEffects(
      input, scope, bookingId, byKind, state.roomWaiverAmount,
      state.cancellationFeeAmount, state.currency
    );
    await this.applyActionEffect(input, scope, {
      bookingId,
      beforeStatus: booking.status,
      bookingEffect,
      cancellationEvaluationAt: state.cancellationEvaluationAt,
      cancellationFeeAmount: state.cancellationFeeAmount,
      roomWaiverAmount: state.roomWaiverAmount,
      currentOccupancy: state.currentOccupancy,
      credentialSnapshot: state.credentialSnapshot,
      ledgerSnapshot: state.ledgerSnapshot,
      rentalStatusProjection
    });
  }

  private async loadFrozenContributors(
    input: HomestayApprovedCancellationInput,
    scope: CancellationScope,
    booking: CancellationBooking,
    bookingId: string
  ) {
    const payload = input.canonicalPayload;
    const frozenOccupancy = payload.occupancy as Record<string, unknown> | null;
    const occupancyRows = booking.occupancyId ? await input.manager.query(
      `SELECT id::text AS id, version, status FROM biz_property_occupancy
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, booking.occupancyId]
    ) as Array<{ id: string; version: number; status: string }> : [];
    const occupancy = occupancyRows[0] ?? null;
    const currentOccupancy = occupancy ? { id: occupancy.id,
      expectedVersion: occupancy.version, beforeStatus: occupancy.status,
      afterStatus: "cancelled" } : null;
    this.assertFrozen(currentOccupancy, frozenOccupancy);
    const currentCredentials = await input.manager.query(
      `SELECT id::text AS id, version, status FROM biz_homestay_stay_credential
        WHERE tenant_id=$1 AND park_id=$2 AND booking_id=$3
          AND status='issued' AND is_deleted=false ORDER BY id FOR UPDATE`,
      [scope.tenantId, scope.parkId, bookingId]
    ) as Array<{ id: string; version: number; status: string }>;
    const credentialSnapshot = currentCredentials.map((row) => ({ id: row.id,
      expectedVersion: row.version, beforeStatus: row.status, afterStatus: "void" }));
    this.assertFrozen(credentialSnapshot, payload.credentials);
    const currentLedger = await this.transactionSupport.lockConfirmedHomestayLedger(
      input.manager, scope, bookingId);
    await this.transactionSupport.assertNoUnresolvedLegacyHomestayFinance(
      input.manager, scope, bookingId);
    const ledgerSnapshot = currentLedger.map((row) => ({ id: row.id,
      expectedVersion: row.version, status: row.status, entryType: row.entryType,
      chargeType: row.chargeType, amount: row.amount, currency: row.currency,
      sourceLedgerEntryId: row.sourceLedgerEntryId }));
    this.assertFrozen(ledgerSnapshot, payload.ledgerContributors);
    const cancellationEvaluationAt = String(payload.cancellationEvaluationAt ?? "");
    const roomWaiverAmount = calculateCancellableRoomCharge(currentLedger);
    const cancellationFeeAmount = this.transactionSupport.calculateCancellationFee(
      booking, cancellationEvaluationAt);
    const financialTotal = formatMoneyCents(
      toMoneyCents(roomWaiverAmount) + toMoneyCents(cancellationFeeAmount));
    const currency = financialTotal === "0.00" ? null : booking.currency;
    if (roomWaiverAmount !== payload.roomWaiverAmount
      || cancellationFeeAmount !== payload.cancellationFeeAmount
      || currency !== payload.currency) throw new ConflictException("Approval source changed");
    return { frozenOccupancy, occupancy, currentOccupancy, currentCredentials,
      credentialSnapshot, ledgerSnapshot, cancellationEvaluationAt,
      roomWaiverAmount, cancellationFeeAmount, currency };
  }

  private assertFrozen(current: unknown, frozen: unknown): void {
    if (propertyApprovalCanonicalHash(current as PropertyApprovalJsonValue)
      !== propertyApprovalCanonicalHash(frozen as PropertyApprovalJsonValue)) {
      throw new ConflictException("Approval source changed");
    }
  }

  private async applyCredentialEffects(
    input: HomestayApprovedCancellationInput,
    scope: { tenantId: string; parkId: string },
    credentials: Array<{ id: string; version: number; status: string }>
  ): Promise<void> {
    for (const credential of credentials) {
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
  }

  private async applyOccupancyEffect(
    input: HomestayApprovedCancellationInput,
    scope: { tenantId: string; parkId: string },
    occupancy: { id: string; version: number; status: string } | null,
    frozen: Record<string, unknown> | null
  ): Promise<void> {
    if (!occupancy || !frozen) return;
    const released = typeormQueryRows<{ id: string }>(await input.manager.query(
      `UPDATE biz_property_occupancy
          SET status=$8, release_reason=$5, released_at=clock_timestamp(),
              update_by=$6, update_time=clock_timestamp(), version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4
          AND status=$7 AND is_deleted=false RETURNING id::text AS id`,
      [scope.tenantId, scope.parkId, occupancy.id, occupancy.version,
        String(input.canonicalPayload.reason ?? ""), input.request.requesterId, occupancy.status,
        String(frozen.afterStatus)]
    ));
    if (released.length !== 1) throw new ConflictException("Approval source changed");
  }

  private async applyBookingEffect(
    input: HomestayApprovedCancellationInput,
    scope: { tenantId: string; parkId: string },
    bookingId: string,
    status: string
  ): Promise<void> {
    const cancelled = typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_homestay_booking
          SET status='cancelled', cancel_reason=$5, cancelled_at=clock_timestamp(),
              update_by=$6, update_time=clock_timestamp(), version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4
          AND status=$7 AND is_deleted=false RETURNING version`,
      [scope.tenantId, scope.parkId, bookingId, input.sourceExpectedVersion,
        String(input.canonicalPayload.reason ?? ""), input.request.requesterId, status]
    ));
    if (cancelled.length !== 1 || cancelled[0]!.version !== input.sourceExpectedVersion + 1) {
      throw new ConflictException("Approval source changed");
    }
  }

  private async applyLedgerEffects(
    input: HomestayApprovedCancellationInput,
    scope: { tenantId: string; parkId: string },
    bookingId: string,
    byKind: Map<string, { effectKind: string; effectLineKey: string; effectHash: string;
      lineAmount: string | null; currency: string | null }>,
    roomWaiverAmount: string,
    cancellationFeeAmount: string,
    currency: string | null
  ): Promise<void> {
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
  }

  private async applyActionEffect(
    input: HomestayApprovedCancellationInput,
    scope: { tenantId: string; parkId: string },
    state: {
      bookingId: string;
      beforeStatus: string;
      bookingEffect: { effectKind: string; effectLineKey: string; effectHash: string };
      cancellationEvaluationAt: string;
      cancellationFeeAmount: string;
      roomWaiverAmount: string;
      currentOccupancy: unknown;
      credentialSnapshot: unknown;
      ledgerSnapshot: unknown;
      rentalStatusProjection: unknown;
    }
  ): Promise<void> {
    const contributorHash = propertyApprovalCanonicalHash({
      occupancy: state.currentOccupancy,
      credentials: state.credentialSnapshot,
      ledger: state.ledgerSnapshot
    } as PropertyApprovalJsonValue);
    const actionRows = await input.manager.query(
      `INSERT INTO biz_homestay_booking_action_log(
         tenant_id,park_id,booking_id,action,before_status,after_status,reason,snapshot,
         operator_id,operator_name,action_time,create_time,approval_execution_key,
         approval_effect_kind,approval_effect_line_key,approval_effect_hash)
       VALUES($1,$2,$3,'cancel',$4,'cancelled',$5,$6::jsonb,$7,$8,clock_timestamp(),
              clock_timestamp(),$9,$10,$11,$12) RETURNING id::text AS id`,
      [scope.tenantId, scope.parkId, state.bookingId, state.beforeStatus,
        String(input.canonicalPayload.reason ?? ""), JSON.stringify({
          cancellation_evaluation_at: state.cancellationEvaluationAt,
          cancellation_fee: state.cancellationFeeAmount,
          room_waiver_amount: state.roomWaiverAmount,
          compound_contributors: {
            occupancy: state.currentOccupancy,
            credentials: state.credentialSnapshot,
            ledger: state.ledgerSnapshot
          },
          compound_contributor_hash: contributorHash,
          rental_status_projection: state.rentalStatusProjection
        }), input.request.requesterId, String(input.canonicalPayload.actorName ?? "审批申请人"),
        input.executionIdempotencyKey, state.bookingEffect.effectKind,
        state.bookingEffect.effectLineKey, state.bookingEffect.effectHash]
    ) as Array<{ id: string }>;
    if (actionRows.length !== 1) throw new ConflictException("Approval effect cardinality mismatch");
  }

  private requiredApprovalUuid(value: unknown): string {
    if (typeof value !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new ConflictException("Approval payload is invalid");
    }
    return value;
  }
}
