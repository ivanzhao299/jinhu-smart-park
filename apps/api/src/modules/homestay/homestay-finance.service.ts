import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional
} from "@nestjs/common";
import {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  SYSTEM_PERMISSIONS,
  type HomestayFinanceApprovalSource,
  type PropertyApprovalCommandPort,
  type PropertyApprovalJsonValue,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import {
  assertPropertyHighRiskActionApprovalRequired,
  assertPropertyHighRiskActionPermissions
} from "../../shared/property-workbench/property-high-risk-stopship";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { propertyApprovalCanonicalHash } from "../property-approvals/property-approval.service";
import type { RegisterHomestayLedgerEntryDto } from "./dto/homestay.dto";
import { HomestayLedgerEntryEntity } from "./entities/homestay.entities";
import {
  formatHomestayMoney,
  formatMoneyCents,
  toMoneyCents
} from "./homestay-booking.policy";
import {
  assertHomestayManualLedgerMutation,
  summarizeHomestayLedger
} from "./homestay-finance.policy";
import { HomestayTransactionSupportService } from "./homestay-transaction-support.service";
import type { HomestayLedgerSnapshotRow } from "./homestay-transaction-support.service";

export type HomestayApprovedFinanceInput = {
  manager: EntityManager;
  requestId: string;
  executionIdempotencyKey: string;
  canonicalPayload: Readonly<Record<string, unknown>>;
  sourceExpectedVersion: number;
  request: {
    tenantId: string;
    parkId: string;
    sourceId: string;
    requesterId: string;
  };
};

@Injectable()
export class HomestayFinanceService {
  constructor(
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataSource: DataSource,
    private readonly transactionSupport: HomestayTransactionSupportService,
    @Optional()
    @Inject(PROPERTY_APPROVAL_COMMAND_PORT)
    private readonly approvalCommands?: PropertyApprovalCommandPort
  ) {}

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
      const booking = await this.transactionSupport.lockBooking(manager, scope, bookingId);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      if (dto.entry_type === "refund" || dto.entry_type === "waiver") {
        return this.requestApprovedRefundOrWaiver(
          manager, scope, actor, booking, dto, clientKey
        );
      }
      const ledger = await manager.getRepository(HomestayLedgerEntryEntity).find({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          bookingId,
          status: "confirmed",
          isDeleted: false
        }
      });
      assertHomestayManualLedgerMutation(
        dto.entry_type,
        dto.amount,
        summarizeHomestayLedger(ledger)
      );
      return this.transactionSupport.createLedgerEntry(manager, scope, actor, bookingId, dto);
    });
  }

  async listApprovalSources(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bookingId: string,
    entryType: "refund" | "waiver"
  ): Promise<HomestayFinanceApprovalSource[]> {
    assertPropertyHighRiskActionPermissions(actor, [
      SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_WAIVE,
      SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
    ]);
    const requiredPermission = entryType === "refund"
      ? SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_REGISTER
      : SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_WAIVE;
    if (!this.hasPermission(actor, requiredPermission)) {
      throw new ForbiddenException(`${requiredPermission} permission is required`);
    }
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.transactionSupport.lockBooking(manager, scope, bookingId);
      await this.unitAccessService.assertAccess(scope, actor, booking.unitId);
      const ledger = await this.transactionSupport.lockConfirmedHomestayLedger(manager, scope, bookingId);
      await this.transactionSupport.assertNoUnresolvedLegacyHomestayFinance(manager, scope, bookingId);
      const sourceEntryType = entryType === "refund" ? "payment" : "charge";
      const candidates = ledger.filter((entry) => entry.entryType === sourceEntryType);
      const sources = await Promise.all(candidates.map(async (source) => {
        const allocation = await this.transactionSupport.homestayFinanceAllocationSnapshot(
          manager, scope, source, ledger, entryType
        );
        const availableCents = toMoneyCents(source.amount) - allocation.allocatedCents;
        return availableCents > 0n ? {
          id: source.id,
          entryType: sourceEntryType,
          chargeType: source.chargeType,
          amount: formatHomestayMoney(source.amount),
          availableAmount: formatMoneyCents(availableCents),
          occurredAt: source.occurredAt
        } satisfies HomestayFinanceApprovalSource : null;
      }));
      return sources.filter((source): source is HomestayFinanceApprovalSource => source !== null);
    });
  }

  async executeApprovedFinance(input: HomestayApprovedFinanceInput): Promise<void> {
    const payload = input.canonicalPayload;
    if (!Array.isArray(payload.lines) || payload.lines.length !== 1) {
      throw new ConflictException("Approval source changed");
    }
    const line = payload.lines[0] as Record<string, unknown>;
    const bookingId = this.requiredApprovalUuid(payload.bookingId);
    const sourceId = this.requiredApprovalUuid(line.sourceLedgerEntryId);
    if (bookingId !== input.request.sourceId) {
      throw new ConflictException("Approval source changed");
    }
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    const bookings = await input.manager.query(
      `SELECT version,currency FROM biz_homestay_booking WHERE tenant_id=$1 AND park_id=$2
        AND id=$3 AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, bookingId]
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
    this.assertApprovedSourceUnchanged(booking, source, lockedSource, input, line);
    await this.transactionSupport.assertNoUnresolvedLegacyHomestayFinance(
      input.manager, scope, bookingId
    );
    const entryType = String(line.entryType) as "refund" | "waiver";
    assertHomestayManualLedgerMutation(
      entryType,
      String(line.amount),
      summarizeHomestayLedger(currentLedger)
    );
    const allocation = await this.transactionSupport.homestayFinanceAllocationSnapshot(
      input.manager, scope, source!, currentLedger, entryType
    );
    const remaining = toMoneyCents(source!.amount) - allocation.allocatedCents;
    this.assertApprovedAllocationUnchanged(allocation, remaining, line);
    await this.insertApprovedLedgerEffect(input, scope, bookingId, sourceId, line, entryType);
  }

  private async requestApprovedRefundOrWaiver(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    booking: { id: string; unitId: string; version: number },
    dto: RegisterHomestayLedgerEntryDto,
    clientKey: string
  ) {
    if (!dto.source_ledger_entry_id) {
      throw new BadRequestException("source_ledger_entry_id is required for refund or waiver");
    }
    await this.transactionSupport.lockHomestayFinanceSourceKey(
      manager, scope, booking.id, dto.source_ledger_entry_id
    );
    const lockedSource = await this.transactionSupport.lockHomestayFinanceSource(
      manager, scope, booking.id, dto.source_ledger_entry_id
    );
    const ledger = await this.transactionSupport.lockConfirmedHomestayLedger(
      manager, scope, booking.id
    );
    await this.transactionSupport.assertNoUnresolvedLegacyHomestayFinance(
      manager, scope, booking.id
    );
    const entryType = dto.entry_type as "refund" | "waiver";
    assertHomestayManualLedgerMutation(entryType, dto.amount, summarizeHomestayLedger(ledger));
    const source = ledger.find((row) => row.id === dto.source_ledger_entry_id);
    const expectedSourceType = entryType === "refund" ? "payment" : "charge";
    if (!source || source.id !== lockedSource.id || source.version !== lockedSource.version
      || source.currency !== lockedSource.currency || source.entryType !== expectedSourceType) {
      throw new ConflictException(`${entryType} must reference a confirmed ${expectedSourceType} entry`);
    }
    const allocation = await this.transactionSupport.homestayFinanceAllocationSnapshot(
      manager, scope, source, ledger, entryType
    );
    const remaining = toMoneyCents(source.amount) - allocation.allocatedCents;
    if (remaining < 0n || toMoneyCents(dto.amount) > remaining) {
      throw new ConflictException("Refund or waiver amount exceeds its source entry");
    }
    const amount = formatHomestayMoney(dto.amount);
    return this.approvalCommands!.createPendingRequest(
      { transactionContext: manager },
      {
        contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
        scope,
        actionId: "homestay.finance.refund-or-waive.request",
        sourceType: "homestay-booking",
        sourceId: booking.id,
        sourceExpectedVersion: booking.version,
        requesterId: actor.sub,
        submitterId: actor.sub,
        actorId: actor.sub,
        clientKey,
        businessIntentKey:
          `homestay-finance:${booking.id}:${booking.version}:${entryType}:${source.id}:${source.version}`,
        canonicalPayload: {
          bookingId: booking.id,
          bookingExpectedVersion: booking.version,
          reason: dto.reason.trim(),
          actorName: actor.realName?.trim() || actor.username,
          lines: [{
            entryType,
            sourceLedgerEntryId: source.id,
            sourceExpectedVersion: source.version,
            sourceEntryType: source.entryType,
            sourceAmount: source.amount,
            // A reversal inherits the authoritative source classification.  The
            // client field is retained for the normal charge/payment contract,
            // but must not be able to relabel an approved reversal.
            chargeType: source.chargeType,
            amount,
            currency: source.currency,
            paymentRecorderId: source.recordedBy,
            allocatedAmount: formatMoneyCents(allocation.allocatedCents),
            remainingAvailableBalance: formatMoneyCents(remaining),
            allocationContributors: allocation.contributors
          }]
        },
        payloadSchemaVersion: 1,
        amount,
        currency: source.currency
      }
    );
  }

  private async insertApprovedLedgerEffect(
    input: HomestayApprovedFinanceInput,
    scope: TenantParkScope,
    bookingId: string,
    sourceId: string,
    line: Record<string, unknown>,
    entryType: "refund" | "waiver"
  ): Promise<void> {
    const manifests = await input.manager.query(
      `SELECT effect_kind AS "effectKind",effect_line_key AS "effectLineKey",
              invariant_hash AS "effectHash",line_amount::text AS "lineAmount",currency
         FROM biz_property_execution_effect_manifest WHERE tenant_id=$1 AND park_id=$2
          AND request_id=$3`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as Array<{ effectKind: string; effectLineKey: string; effectHash: string;
      lineAmount: string; currency: string }>;
    const effect = manifests[0];
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
       RETURNING id::text AS id`,
      [scope.tenantId, scope.parkId, bookingId, entryType, String(line.chargeType),
        effect.lineAmount, effect.currency, sourceId, String(input.canonicalPayload.reason ?? ""),
        input.request.requesterId, input.executionIdempotencyKey, effect.effectKind,
        effect.effectLineKey, effect.effectHash]
    ) as Array<{ id: string }>;
    if (inserted.length !== 1) {
      throw new ConflictException("Approval effect cardinality mismatch");
    }
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return Boolean(
      actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission)
    );
  }

  private assertApprovedSourceUnchanged(
    booking: { version: number; currency: string } | undefined,
    source: HomestayLedgerSnapshotRow | undefined,
    lockedSource: HomestayLedgerSnapshotRow,
    input: HomestayApprovedFinanceInput,
    line: Record<string, unknown>
  ): void {
    if (!booking || booking.version !== input.sourceExpectedVersion || !source
      || source.id !== lockedSource.id || source.version !== lockedSource.version
      || source.currency !== lockedSource.currency
      || source.version !== Number(line.sourceExpectedVersion)
      || source.entryType !== line.sourceEntryType || source.amount !== line.sourceAmount
      || source.currency !== line.currency || booking.currency !== line.currency) {
      throw new ConflictException("Approval source changed");
    }
  }

  private assertApprovedAllocationUnchanged(
    allocation: { allocatedCents: bigint; contributors: unknown[] },
    remaining: bigint,
    line: Record<string, unknown>
  ): void {
    if (remaining < 0n
      || formatMoneyCents(allocation.allocatedCents) !== line.allocatedAmount
      || formatMoneyCents(remaining) !== line.remainingAvailableBalance
      || propertyApprovalCanonicalHash(
        allocation.contributors as unknown as PropertyApprovalJsonValue
      ) !== propertyApprovalCanonicalHash(line.allocationContributors as PropertyApprovalJsonValue)
      || toMoneyCents(String(line.amount)) > remaining) {
      throw new ConflictException("Refund or waiver amount exceeds its source entry");
    }
  }

  private requiredApprovalUuid(value: unknown): string {
    if (typeof value !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(value)) {
      throw new ConflictException("Approval payload is invalid");
    }
    return value;
  }
}
