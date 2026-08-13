import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  SYSTEM_PERMISSIONS,
  type PropertyApprovalCommandPort,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import {
  assertPropertyHighRiskActionApprovalRequired,
  assertPropertyHighRiskActionPermissions
} from "../../shared/property-workbench/property-high-risk-stopship";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import type { RegisterHousingLedgerEntryDto } from "./dto/housing.dto";
import {
  HousingLedgerEntryEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";
import {
  applyHousingReceivableMutation,
  assertHousingDepositMutation,
  calculateHousingDepositBalance,
  formatHousingMoney
} from "./housing-finance.policy";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";

export type ExecuteApprovedHousingFinanceInput = {
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

type ApprovedLeaseSnapshot = {
  version: number;
  currency: string;
  depositAmount: string;
};

type ApprovedReceivableSnapshot = {
  version: number;
  amount: string;
  paidAmount: string;
  waivedAmount: string;
  chargeType: string;
  currency: string;
  status: string;
};

@Injectable()
export class HousingFinanceCommandService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly support: HousingTransactionSupportService,
    @Optional()
    @Inject(PROPERTY_APPROVAL_COMMAND_PORT)
    private readonly approvalCommands?: PropertyApprovalCommandPort
  ) {}

  registerLedger(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: RegisterHousingLedgerEntryDto,
    clientKey = ""
  ) {
    this.assertEntryPermission(actor, dto.entry_type);
    return this.dataSource.transaction((manager) =>
      this.registerInTransaction(manager, scope, actor, leaseId, dto, clientKey));
  }

  async executeApprovedFinance(input: ExecuteApprovedHousingFinanceInput): Promise<void> {
    const payload = input.canonicalPayload;
    if (!Array.isArray(payload.lines) || payload.lines.length !== 1) {
      throw new ConflictException("Approval source changed");
    }
    const line = payload.lines[0] as Record<string, unknown>;
    const leaseId = this.approvalUuid(payload.leaseId);
    const receivableId = this.approvalUuid(line.receivableId);
    if (leaseId !== input.request.sourceId) throw new ConflictException("Approval source changed");
    const scope = { tenantId: input.request.tenantId, parkId: input.request.parkId };
    const snapshot = await this.lockApprovalSnapshot(input.manager, scope, leaseId, receivableId);
    this.assertApprovalSnapshot(input, line, snapshot.lease, snapshot.receivable);
    const approvedLease = snapshot.lease!;
    const approvedReceivable = snapshot.receivable!;
    await this.assertNoLegacyHighRiskEntries(input.manager, scope, leaseId);
    const effect = await this.loadApprovalEffect(input, scope, line);
    const entryType = line.entryType === "deposit-refund"
      ? "deposit_refund"
      : String(line.entryType);
    await this.assertApprovedDepositMutation(
      input.manager,
      scope,
      leaseId,
      approvedLease,
      entryType,
      String(line.amount)
    );
    await this.updateApprovedReceivable(
      input,
      line,
      receivableId,
      approvedReceivable,
      entryType
    );
    await this.insertApprovedLedgerEntry(
      input,
      scope,
      leaseId,
      receivableId,
      line,
      entryType,
      effect
    );
  }

  private async registerInTransaction(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    dto: RegisterHousingLedgerEntryDto,
    clientKey: string
  ) {
    const lease = await this.support.lockLease(manager, scope, leaseId);
    await this.unitAccessService.assertAccess(scope, actor, lease.unitId);
    this.support.assertStatus(lease, ["active", "expiring", "checkout_pending"]);
    this.assertDirectEntryType(dto.entry_type);
    const receivable = await this.resolveReceivable(manager, scope, leaseId, dto);
    await this.assertDepositEntry(manager, scope, leaseId, lease.depositAmount, dto);
    if (this.isApprovalEntry(dto.entry_type)) {
      if (!receivable) {
        throw new BadRequestException("Receivable is required for refund or waiver");
      }
      return this.createFinanceApproval(
        manager,
        scope,
        actor,
        lease,
        receivable,
        dto,
        clientKey
      );
    }
    await this.applyDirectReceivable(manager, actor, receivable, dto);
    return this.createDirectLedgerEntry(manager, scope, actor, leaseId, receivable, dto);
  }

  private assertEntryPermission(actor: JwtPrincipal, entryType: string) {
    if (this.isApprovalEntry(entryType)) {
      const domainPermission = entryType === "waiver"
        ? SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE
        : SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER;
      assertPropertyHighRiskActionPermissions(actor, [
        domainPermission,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]);
      if (!this.approvalCommands) {
        assertPropertyHighRiskActionApprovalRequired(
          "housing.finance.refund-waive-or-deposit-refund"
        );
        throw new ConflictException("Property approval runtime is unavailable");
      }
    }
    const permission = entryType === "waiver"
      ? SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE
      : SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER;
    if (!this.hasPermission(actor, permission)) {
      throw new ForbiddenException(`${permission} permission is required`);
    }
  }

  private assertDirectEntryType(entryType: string) {
    if (entryType === "charge") {
      throw new BadRequestException("Create tenant charges through a charge plan and receivable");
    }
    if (entryType === "deposit_deduction") {
      throw new BadRequestException(
        "Deposit deductions can only be created by the move-out handover workflow"
      );
    }
  }

  private async resolveReceivable(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string,
    dto: RegisterHousingLedgerEntryDto
  ) {
    let receivable = dto.receivable_id
      ? await this.findReceivable(manager, scope, leaseId, dto.receivable_id)
      : null;
    if (receivable) this.assertReceivableEntryType(receivable, dto.entry_type);
    if (dto.entry_type === "deposit_receipt" && !receivable) {
      receivable = await manager.getRepository(HousingReceivableEntity).findOne({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          leaseId,
          chargeType: "deposit",
          sourceType: "lease_deposit",
          isDeleted: false
        },
        lock: { mode: "pessimistic_write" }
      });
      if (!receivable) throw new ConflictException("Lease deposit receivable is missing");
    }
    return receivable;
  }

  private async findReceivable(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string,
    id: string
  ) {
    const receivable = await manager.getRepository(HousingReceivableEntity).findOne({
      where: {
        id,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leaseId,
        isDeleted: false
      },
      lock: { mode: "pessimistic_write" }
    });
    if (!receivable) throw new NotFoundException("Housing receivable not found");
    if (receivable.status === "void") {
      throw new ConflictException("Void receivable cannot receive financial entries");
    }
    return receivable;
  }

  private assertReceivableEntryType(receivable: HousingReceivableEntity, entryType: string) {
    if (receivable.chargeType === "deposit") {
      if (!["deposit_receipt", "deposit_refund"].includes(entryType)) {
        throw new BadRequestException(
          "Deposit receivables require deposit_receipt or deposit_refund"
        );
      }
    } else if (entryType.startsWith("deposit_")) {
      throw new BadRequestException("Deposit entries can only target the lease deposit receivable");
    }
  }

  private async assertDepositEntry(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string,
    depositAmount: string,
    dto: RegisterHousingLedgerEntryDto
  ) {
    if (!dto.entry_type.startsWith("deposit_")) return;
    const entries = await manager.getRepository(HousingLedgerEntryEntity).find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leaseId,
        status: "confirmed",
        isDeleted: false
      }
    });
    assertHousingDepositMutation(
      depositAmount,
      calculateHousingDepositBalance(entries),
      dto.entry_type,
      dto.amount
    );
  }

  private async createFinanceApproval(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    lease: Awaited<ReturnType<HousingTransactionSupportService["lockLease"]>>,
    receivable: HousingReceivableEntity,
    dto: RegisterHousingLedgerEntryDto,
    clientKey: string
  ) {
    await this.assertNoLegacyHighRiskEntries(manager, scope, lease.id);
    const paymentActors = await manager.query(
      `SELECT create_by::text AS "actorId" FROM biz_housing_ledger_entry
        WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3 AND receivable_id=$4
          AND entry_type IN ('payment','deposit_receipt') AND status='confirmed'
          AND is_deleted=false ORDER BY occurred_at DESC,id DESC LIMIT 1 FOR UPDATE`,
      [scope.tenantId, scope.parkId, lease.id, receivable.id]
    ) as Array<{ actorId: string | null }>;
    if (!paymentActors[0]?.actorId) {
      throw new ConflictException("A linked payment recorder is required before approval");
    }
    const amount = formatHousingMoney(dto.amount);
    const entryType = dto.entry_type === "deposit_refund" ? "deposit-refund" : dto.entry_type;
    return this.approvalCommands!.createPendingRequest({ transactionContext: manager }, {
      contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
      scope,
      actionId: "housing.finance.refund-waive-or-deposit-refund.request",
      sourceType: "housing-lease",
      sourceId: lease.id,
      sourceExpectedVersion: lease.version,
      requesterId: actor.sub,
      submitterId: actor.sub,
      actorId: actor.sub,
      clientKey,
      businessIntentKey: `housing-finance:${lease.id}:${lease.version}:${entryType}:${receivable.id}:${receivable.version}`,
      canonicalPayload: {
        leaseId: lease.id,
        leaseExpectedVersion: lease.version,
        reason: dto.reason.trim(),
        actorName: actor.realName?.trim() || actor.username,
        lines: [{
          entryType,
          receivableId: receivable.id,
          receivableExpectedVersion: receivable.version,
          receivableAmount: receivable.amount,
          receivablePaidAmount: receivable.paidAmount,
          receivableWaivedAmount: receivable.waivedAmount,
          chargeType: receivable.chargeType,
          amount,
          currency: receivable.currency,
          paymentRecorderId: paymentActors[0].actorId
        }]
      },
      payloadSchemaVersion: 1,
      amount,
      currency: receivable.currency
    });
  }

  private async assertNoLegacyHighRiskEntries(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string
  ) {
    const unresolved = await manager.query(
      `SELECT count(*)::integer AS count FROM biz_housing_ledger_entry result
        WHERE result.tenant_id=$1 AND result.park_id=$2 AND result.lease_id=$3
          AND result.entry_type IN ('refund','waiver','deposit_refund')
          AND result.approval_execution_key IS NULL AND result.is_deleted=false`,
      [scope.tenantId, scope.parkId, leaseId]
    ) as Array<{ count: number }>;
    if (Number(unresolved[0]?.count ?? 0) > 0) {
      throw new ConflictException("Legacy refund or waiver source must be reconciled before approval");
    }
  }

  private async applyDirectReceivable(
    manager: EntityManager,
    actor: JwtPrincipal,
    receivable: HousingReceivableEntity | null,
    dto: RegisterHousingLedgerEntryDto
  ) {
    if (receivable) {
      this.applyReceivableEntry(
        receivable,
        dto.entry_type === "deposit_receipt"
          ? { ...dto, entry_type: "payment" }
          : dto
      );
      receivable.updateBy = actor.sub;
      await manager.getRepository(HousingReceivableEntity).save(receivable);
      return;
    }
    if (["payment", "refund", "waiver"].includes(dto.entry_type)) {
      throw new BadRequestException("Receivable is required for payment, refund, or waiver");
    }
  }

  private createDirectLedgerEntry(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leaseId: string,
    receivable: HousingReceivableEntity | null,
    dto: RegisterHousingLedgerEntryDto
  ) {
    const chargeType = dto.entry_type.startsWith("deposit_")
      ? "deposit"
      : receivable?.chargeType;
    if (!chargeType) {
      throw new BadRequestException("Receivable charge type is required for financial entries");
    }
    const repository = manager.getRepository(HousingLedgerEntryEntity);
    return repository.save(repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      leaseId,
      receivableId: receivable?.id ?? null,
      entryType: dto.entry_type,
      chargeType,
      amount: formatHousingMoney(dto.amount),
      paymentMethod: dto.payment_method ?? null,
      transactionReference: dto.transaction_reference ?? null,
      sourceType: "manual",
      sourceId: null,
      status: "confirmed",
      reason: dto.reason,
      occurredAt: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub
    }));
  }

  private async lockApprovalSnapshot(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string,
    receivableId: string
  ) {
    const leases = await manager.query(
      `SELECT version,currency,deposit_amount::text AS "depositAmount"
         FROM biz_housing_lease WHERE tenant_id=$1 AND park_id=$2
          AND id=$3 AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, leaseId]
    ) as ApprovedLeaseSnapshot[];
    const receivables = await manager.query(
      `SELECT version,amount::text AS amount,paid_amount::text AS "paidAmount",
              waived_amount::text AS "waivedAmount",charge_type AS "chargeType",currency,status
         FROM biz_housing_receivable WHERE tenant_id=$1 AND park_id=$2 AND lease_id=$3 AND id=$4
          AND is_deleted=false FOR UPDATE`,
      [scope.tenantId, scope.parkId, leaseId, receivableId]
    ) as ApprovedReceivableSnapshot[];
    return { lease: leases[0], receivable: receivables[0] };
  }

  private assertApprovalSnapshot(
    input: ExecuteApprovedHousingFinanceInput,
    line: Record<string, unknown>,
    lease: ApprovedLeaseSnapshot | undefined,
    receivable: ApprovedReceivableSnapshot | undefined
  ): asserts lease is ApprovedLeaseSnapshot {
    if (!lease || lease.version !== input.sourceExpectedVersion || !receivable
      || receivable.version !== Number(line.receivableExpectedVersion)
      || receivable.amount !== line.receivableAmount
      || receivable.paidAmount !== line.receivablePaidAmount
      || receivable.waivedAmount !== line.receivableWaivedAmount
      || receivable.currency !== line.currency
      || receivable.status === "void") {
      throw new ConflictException("Approval source changed");
    }
  }

  private async loadApprovalEffect(
    input: ExecuteApprovedHousingFinanceInput,
    scope: TenantParkScope,
    line: Record<string, unknown>
  ) {
    const manifests = await input.manager.query(
      `SELECT effect_kind AS "effectKind",effect_line_key AS "effectLineKey",
              invariant_hash AS "effectHash",line_amount::text AS "lineAmount",currency
         FROM biz_property_execution_effect_manifest
        WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3`,
      [scope.tenantId, scope.parkId, input.requestId]
    ) as Array<{
      effectKind: string;
      effectLineKey: string;
      effectHash: string;
      lineAmount: string;
      currency: string;
    }>;
    const effect = manifests[0];
    if (!effect || effect.lineAmount !== line.amount || effect.currency !== line.currency) {
      throw new ConflictException("Approval effect manifest missing");
    }
    return effect;
  }

  private async assertApprovedDepositMutation(
    manager: EntityManager,
    scope: TenantParkScope,
    leaseId: string,
    lease: ApprovedLeaseSnapshot,
    entryType: string,
    amount: string
  ) {
    if (entryType !== "deposit_refund") return;
    const entries = await manager.getRepository(HousingLedgerEntryEntity).find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leaseId,
        status: "confirmed",
        isDeleted: false
      }
    });
    assertHousingDepositMutation(
      lease.depositAmount,
      calculateHousingDepositBalance(entries),
      "deposit_refund",
      amount
    );
  }

  private async updateApprovedReceivable(
    input: ExecuteApprovedHousingFinanceInput,
    line: Record<string, unknown>,
    receivableId: string,
    receivable: ApprovedReceivableSnapshot,
    entryType: string
  ) {
    if (entryType === "deposit_refund") return;
    const mutable = { ...receivable } as HousingReceivableEntity;
    this.applyReceivableEntry(mutable, {
      entry_type: entryType,
      amount: String(line.amount)
    } as RegisterHousingLedgerEntryDto);
    const scope = input.request;
    const updated = typeormQueryRows<{ version: number }>(await input.manager.query(
      `UPDATE biz_housing_receivable SET paid_amount=$5,waived_amount=$6,status=$7,
              update_by=$8,update_time=clock_timestamp(),version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND version=$4 RETURNING version`,
      [scope.tenantId, scope.parkId, receivableId, receivable.version,
        mutable.paidAmount, mutable.waivedAmount, mutable.status, scope.requesterId]
    ));
    if (updated.length !== 1) throw new ConflictException("Approval source changed");
  }

  private async insertApprovedLedgerEntry(
    input: ExecuteApprovedHousingFinanceInput,
    scope: TenantParkScope,
    leaseId: string,
    receivableId: string,
    line: Record<string, unknown>,
    entryType: string,
    effect: {
      effectKind: string;
      effectLineKey: string;
      effectHash: string;
      lineAmount: string;
      currency: string;
    }
  ) {
    const inserted = typeormQueryRows<{ id: string }>(await input.manager.query(
      `INSERT INTO biz_housing_ledger_entry(
         tenant_id,park_id,lease_id,receivable_id,entry_type,charge_type,amount,currency,
         source_type,source_id,status,reason,occurred_at,create_by,update_by,
         approval_execution_key,approval_effect_kind,approval_effect_line_key,approval_effect_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'approval',$4,'confirmed',$9,clock_timestamp(),$10,$10,$11,$12,$13,$14)
       RETURNING id::text AS id`,
      [scope.tenantId, scope.parkId, leaseId, receivableId, entryType,
        String(line.chargeType), effect.lineAmount, effect.currency,
        String(input.canonicalPayload.reason ?? ""), input.request.requesterId,
        input.executionIdempotencyKey, effect.effectKind, effect.effectLineKey, effect.effectHash]
    ));
    if (inserted.length !== 1) {
      throw new ConflictException("Approval effect cardinality mismatch");
    }
  }

  private applyReceivableEntry(
    receivable: HousingReceivableEntity,
    dto: Pick<RegisterHousingLedgerEntryDto, "entry_type" | "amount">
  ) {
    const result = applyHousingReceivableMutation(
      receivable.amount,
      receivable.paidAmount,
      receivable.waivedAmount,
      dto.entry_type,
      dto.amount
    );
    receivable.paidAmount = result.paidAmount;
    receivable.waivedAmount = result.waivedAmount;
    receivable.status = result.status;
  }

  private approvalUuid(value: unknown): string {
    const text = typeof value === "string" ? value : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
      throw new ConflictException("Approval source changed");
    }
    return text;
  }

  private isApprovalEntry(entryType: string) {
    return ["refund", "waiver", "deposit_refund"].includes(entryType);
  }

  private hasPermission(actor: JwtPrincipal, permission: string) {
    return Boolean(
      actor.isSuper
      || actor.permissions.includes("*")
      || actor.permissions.includes(permission)
    );
  }
}
